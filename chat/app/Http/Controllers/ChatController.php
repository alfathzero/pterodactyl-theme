<?php

/* CHAT-ROOM START — custom global chat room (part of pterodactyl-theme) */

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\ChatMessage;
use Pterodactyl\Models\ChatMute;
use Pterodactyl\Models\ChatReaction;
use Pterodactyl\Models\User;

class ChatController extends Controller
{
    public const MAX_LEN = 800;
    public const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
    public const MUTE_MINUTES = [10, 60, 1440];
    private const ONLINE_TTL = 45;

    /** User yang login (pengaman kalau middleware auth somehow kelewat). */
    private function me(Request $request): User
    {
        $u = $request->user();
        if (!$u) {
            abort(401, 'Login dulu');
        }

        return $u;
    }

    /** GET /chat/messages — latest, ?after=ID (poll), ?before=ID (scroll up). */
    public function index(Request $request): JsonResponse
    {
        $user = $this->me($request);
        $this->touchOnline($user->id);

        $after = (int) $request->query('after', 0);
        $before = (int) $request->query('before', 0);

        $query = ChatMessage::query()->with('user:id,username,name_first,root_admin');
        if ($after > 0) {
            $messages = $query->where('id', '>', $after)->orderBy('id')->limit(50)->get();
        } elseif ($before > 0) {
            $messages = $query->where('id', '<', $before)->orderByDesc('id')->limit(50)->get()->reverse();
        } else {
            $messages = $query->orderByDesc('id')->limit(50)->get()->reverse();
        }

        return new JsonResponse([
            'messages' => $this->decorate($messages, $user),
            'online' => $this->onlineCount(),
            'my' => [
                'id' => $user->id,
                'username' => $user->username,
                'admin' => (bool) $user->root_admin,
                'muted_until' => $this->mutedUntil($user->id),
            ],
        ]);
    }

    /** POST /chat/messages */
    public function store(Request $request): JsonResponse
    {
        $user = $this->me($request);

        if ($until = $this->mutedUntil($user->id)) {
            return new JsonResponse(['error' => 'Kamu di-mute sampai ' . $until], 403);
        }

        $data = $request->validate([
            'body' => ['required', 'string', 'max:' . self::MAX_LEN],
        ]);

        $body = $this->clean($data['body']);
        if (mb_strlen($body) < 1) {
            return new JsonResponse(['error' => 'Pesan kosong'], 422);
        }

        // anti double-post: pesan sama dalam 6 detik ditolak
        $recent = ChatMessage::withTrashed()->where('user_id', $user->id)
            ->where('body', $body)
            ->where('created_at', '>=', Carbon::now()->subSeconds(6))
            ->exists();
        if ($recent) {
            return new JsonResponse(['error' => 'Kirim pesan yang sama terlalu sering 😅'], 429);
        }

        // resolve @mention ke user id
        $mentionNames = [];
        if (preg_match_all('/@([A-Za-z0-9._\-]{2,24})/', $body, $m)) {
            $mentionNames = array_slice(array_unique($m[1]), 0, 10);
        }
        $mentionIds = User::query()->withoutGlobalScope('sano_user_isolation')
            ->whereIn('username', $mentionNames)->pluck('id')->all();

        $message = ChatMessage::query()->create([
            'user_id' => $user->id,
            'body' => $body,
            'mentions' => $mentionIds ?: null,
        ]);

        $fresh = $message->load('user:id,username,name_first,root_admin');

        return new JsonResponse(['message' => $this->decorate(collect([$fresh]), $user)[0]], 201);
    }

    /** DELETE /chat/messages/{id} — pemilik atau admin. */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $this->me($request);
        $message = ChatMessage::query()->find($id);
        if (!$message) {
            return new JsonResponse(['error' => 'Pesan ga ada'], 404);
        }
        if ($message->user_id !== $user->id && !$user->root_admin) {
            return new JsonResponse(['error' => 'Bukan hakmu hapus ini'], 403);
        }
        $message->delete();

        return new JsonResponse(['ok' => true]);
    }

    /** POST /chat/messages/{id}/react {emoji} — toggle. */
    public function react(Request $request, int $id): JsonResponse
    {
        $user = $this->me($request);
        $data = $request->validate(['emoji' => ['required', 'string', 'max:8']]);
        if (!in_array($data['emoji'], self::REACTIONS, true)) {
            return new JsonResponse(['error' => 'Emoji ga didukung'], 422);
        }
        $message = ChatMessage::query()->find($id);
        if (!$message || $message->trashed()) {
            return new JsonResponse(['error' => 'Pesan ga ada'], 404);
        }

        $existing = ChatReaction::query()
            ->where('message_id', $id)->where('user_id', $user->id)->where('emoji', $data['emoji'])->first();
        if ($existing) {
            $existing->delete();
        } else {
            ChatReaction::query()->create([
                'message_id' => $id, 'user_id' => $user->id, 'emoji' => $data['emoji'],
            ]);
        }

        return new JsonResponse(['reactions' => $this->decorate(collect([$message]), $user)[0]['reactions']]);
    }

    /** GET /chat/users?q= — autocomplete @mention. */
    public function users(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 1) {
            return new JsonResponse(['users' => []]);
        }
        $users = User::query()->withoutGlobalScope('sano_user_isolation')
            ->where('username', 'like', $q . '%')
            ->orderBy('username')
            ->limit(8)
            ->get(['id', 'username']);

        return new JsonResponse(['users' => $users]);
    }

    /** POST /chat/mute/{userId} {minutes} — admin only. */
    public function mute(Request $request, int $userId): JsonResponse
    {
        $user = $this->me($request);
        if (!$user->root_admin) {
            return new JsonResponse(['error' => 'Admin only'], 403);
        }
        $data = $request->validate([
            'minutes' => ['required', 'integer'],
            'reason' => ['nullable', 'string', 'max:190'],
        ]);
        if (!in_array((int) $data['minutes'], self::MUTE_MINUTES, true)) {
            return new JsonResponse(['error' => 'Durasi ga valid'], 422);
        }
        $target = User::query()->withoutGlobalScope('sano_user_isolation')->find($userId);
        if (!$target) {
            return new JsonResponse(['error' => 'User ga ada'], 404);
        }

        ChatMute::query()->updateOrCreate(
            ['user_id' => $target->id],
            [
                'muted_by' => $user->id,
                'muted_until' => Carbon::now()->addMinutes((int) $data['minutes']),
                'reason' => $request->input('reason'),
            ]
        );

        return new JsonResponse(['ok' => true, 'muted_until' => Carbon::now()->addMinutes((int) $data['minutes'])->toIso8601String()]);
    }

    /** DELETE /chat/mute/{userId} — admin only. */
    public function unmute(Request $request, int $userId): JsonResponse
    {
        $user = $this->me($request);
        if (!$user->root_admin) {
            return new JsonResponse(['error' => 'Admin only'], 403);
        }
        ChatMute::query()->where('user_id', $userId)->delete();

        return new JsonResponse(['ok' => true]);
    }

    // ================= helpers =================

    private function clean(string $body): string
    {
        $body = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $body);
        $body = str_replace(["\r\n", "\r"], "\n", $body);
        // max 4 baris kosong beruntun
        $body = preg_replace('/(\n){5,}/', "\n\n\n\n", $body);

        return trim($body);
    }

    /** Ubah collection pesan jadi payload siap-render. */
    private function decorate($messages, User $me): array
    {
        $ids = $messages->pluck('id')->all();
        $authorIds = $messages->pluck('user_id')->unique()->all();

        $reactions = ChatReaction::query()->whereIn('message_id', $ids)->get()
            ->groupBy('message_id');
        $mutes = ChatMute::query()->whereIn('user_id', $authorIds)
            ->where('muted_until', '>', Carbon::now())
            ->pluck('muted_until', 'user_id');

        $out = [];
        foreach ($messages as $msg) {
            $agg = [];
            foreach (($reactions[$msg->id] ?? collect()) as $r) {
                $agg[$r->emoji] = $agg[$r->emoji] ?? ['c' => 0, 'mine' => false];
                $agg[$r->emoji]['c']++;
                if ($r->user_id === $me->id) {
                    $agg[$r->emoji]['mine'] = true;
                }
            }

            $out[] = [
                'id' => $msg->id,
                'user' => $msg->user ? [
                    'id' => $msg->user->id,
                    'username' => $msg->user->username,
                    'admin' => (bool) $msg->user->root_admin,
                    'muted' => $mutes->has($msg->user->id),
                ] : ['id' => 0, 'username' => 'user-terhapus', 'admin' => false, 'muted' => false],
                'body' => $msg->trashed() ? null : $msg->body,
                'created_at' => optional($msg->created_at)->toIso8601String(),
                'deleted' => (bool) $msg->deleted_at,
                'mentions' => $msg->mentions ?? [],
                'reactions' => $agg,
                'can_delete' => $me->root_admin || $msg->user_id === $me->id,
                'can_mute' => (bool) $me->root_admin && $msg->user_id !== $me->id,
            ];
        }

        return $out;
    }

    private function mutedUntil(int $userId): ?string
    {
        $mute = ChatMute::query()->where('user_id', $userId)->first();
        if ($mute && Carbon::parse($mute->muted_until)->isFuture()) {
            return Carbon::parse($mute->muted_until)->toIso8601String();
        }

        return null;
    }

    private function touchOnline(int $userId): void
    {
        try {
            $now = Carbon::now()->timestamp;
            \Illuminate\Support\Facades\Redis::zadd('pterochat:online', $now, $userId);
            \Illuminate\Support\Facades\Redis::zremrangebyscore('pterochat:online', 0, $now - self::ONLINE_TTL);
        } catch (\Throwable $e) {
        }
    }

    private function onlineCount(): int
    {
        try {
            \Illuminate\Support\Facades\Redis::zremrangebyscore('pterochat:online', 0, Carbon::now()->timestamp - self::ONLINE_TTL);

            return (int) \Illuminate\Support\Facades\Redis::zcard('pterochat:online');
        } catch (\Throwable $e) {
            return 0;
        }
    }
}

/* CHAT-ROOM END */
