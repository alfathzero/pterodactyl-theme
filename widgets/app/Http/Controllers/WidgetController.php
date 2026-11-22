<?php

/* WIDGETS START — widget dashboard (part of pterodactyl-theme) */

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Redis;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;

class WidgetController extends Controller
{
    private const CACHE_TTL = 60;

    /**
     * Satu endpoint buat semua widget dashboard.
     */
    public function data(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return new JsonResponse(['error' => 'Unauthenticated'], 401);
        }

        $global = Cache::remember('widgets:global', self::CACHE_TTL, function () {
            return $this->globalData();
        });

        // Pengaman: kalau ada entry cache basi ber-TTL panjang (mis. ditulis
        // panel/proses lain yang pakai Redis+prefix sama), JANGAN pernah serve
        // data lebih tua dari ~90 detik. Recompute kalau basi.
        $fetched = (int) ($global['fetched_at'] ?? 0);
        if ($fetched === 0 || (time() - $fetched) > (int) (self::CACHE_TTL * 1.5)) {
            $global = $this->globalData();
            Cache::put('widgets:global', $global, self::CACHE_TTL);
        }

        [$myServers, $quota, $myServersTotal] = $this->userData((int) $user->id);

        return new JsonResponse([
            'network' => $global['network'],
            'traffic' => $this->traffic(),
            'my_servers' => $myServers,
            'my_servers_total' => $myServersTotal,
            'quota' => $quota,
            'announcement' => $this->announcement(),
            'generated_at' => time(),
        ]);
    }

    /**
     * Endpoint ringan: cuma pengumuman aktif (buat notifikasi browser).
     */
    public function announcementOnly(): JsonResponse
    {
        return new JsonResponse([
            'announcement' => $this->announcement(),
            'generated_at' => time(),
        ]);
    }

    /**
     * Data global (di-cache 60 detik): status jaringan.
     */
    private function globalData(): array
    {
        $leaderboard = $this->leaderboard();

        $online = 0;
        foreach ($leaderboard['servers'] as $row) {
            $online++;
        }

        $total = Server::withoutGlobalScopes()->count();
        $nodes = Node::query()->count();

        return [
            'fetched_at' => time(),
            'network' => [
                'total' => (int) $total,
                'online' => $online,
                'offline' => max(0, (int) $total - $online),
                'nodes' => (int) $nodes,
                'uptime_pct' => $total > 0 ? (int) round($online / $total * 100) : 0,
                'history' => $this->history(),
            ],
        ];
    }

    /**
     * Data per user: server miliknya + total kuota resource.
     *
     * @return array{0: array<int, array<string, mixed>>, 1: array<string, int>, 2: int}
     */
    private function userData(int $userId): array
    {
        $servers = Server::withoutGlobalScopes()
            ->where('owner_id', $userId)
            ->with('node')
            ->orderBy('name')
            ->get();

        $usage = [];
        foreach ($this->leaderboard()['servers'] as $row) {
            $usage[(string) ($row['id'] ?? '')] = $row;
        }

        $list = [];
        $memUsed = 0;
        $diskUsed = 0;
        $memAlloc = 0;
        $diskAlloc = 0;

        foreach ($servers as $server) {
            $row = $usage[$server->identifier] ?? null;
            $suspended = $server->isSuspended();

            $memAlloc += max(0, (int) $server->memory) * 1048576;
            $diskAlloc += max(0, (int) $server->disk) * 1048576;
            $memUsed += $row ? (int) ($row['memory'] ?? 0) : 0;
            $diskUsed += $row ? (int) ($row['disk'] ?? 0) : 0;

            if (count($list) < 100) {
                $list[] = [
                    'name' => $server->name,
                    'uuid' => $server->uuidShort,
                    'node' => $server->node->name ?? '',
                    'online' => $row !== null,
                    'suspended' => $suspended,
                    'memory_pct' => $row['memory_pct'] ?? null,
                    'disk_pct' => $row['disk_pct'] ?? null,
                ];
            }
        }

        return [
            $list,
            [
                'memory_used' => $memUsed,
                'memory_alloc' => $memAlloc,
                'disk_used' => $diskUsed,
                'disk_alloc' => $diskAlloc,
            ],
            $servers->count(),
        ];
    }

    /**
     * Baca cache leaderboard (dibuat oleh leaderboard:collect).
     */
    private function leaderboard(): array
    {
        $path = storage_path('app/leaderboard.json');
        if (!is_file($path)) {
            return ['servers' => [], 'total_online' => 0];
        }

        $data = json_decode((string) @file_get_contents($path), true);
        if (!is_array($data) || !isset($data['servers']) || !is_array($data['servers'])) {
            return ['servers' => [], 'total_online' => 0];
        }

        return $data;
    }

    /**
     * History server online (maks 60 titik) buat sparkline.
     *
     * @return array<int, int>
     */
    private function history(): array
    {
        $path = storage_path('app/leaderboard-history.json');
        if (!is_file($path)) {
            return [];
        }

        $data = json_decode((string) @file_get_contents($path), true);
        if (!is_array($data)) {
            return [];
        }

        return array_values(array_map(function ($point) {
            return (int) ($point['online'] ?? 0);
        }, array_slice($data, -60)));
    }

    /**
     * Traffic pengunjung panel (pageview + pengunjung unik) dari Redis.
     *
     * @return array<string, mixed>
     */
    private function traffic(): array
    {
        $empty = [
            'online' => 0,
            'today_visitors' => 0,
            'today_views' => 0,
            'week_visitors' => 0,
            'week_views' => 0,
            'history' => array_fill(0, 24, 0),
        ];

        try {
            $redis = Redis::connection();
            $now = time();

            $redis->zremrangebyscore('traffic:online', 0, $now - 300);
            $online = (int) $redis->zcard('traffic:online');

            $day = date('Y-m-d', $now);
            $week = date('o-\WW', $now);

            $todayViews = (int) $redis->get('traffic:views:d:' . $day);
            $todayVisitors = (int) $redis->scard('traffic:uv:d:' . $day);
            $weekViews = (int) $redis->get('traffic:views:w:' . $week);
            $weekVisitors = (int) $redis->scard('traffic:uv:w:' . $week);

            $history = [];
            for ($i = 23; $i >= 0; $i--) {
                $hour = date('Y-m-d\TH', $now - ($i * 3600));
                $history[] = (int) $redis->get('traffic:views:h:' . $hour);
            }

            return [
                'online' => $online,
                'today_visitors' => $todayVisitors,
                'today_views' => $todayViews,
                'week_visitors' => $weekVisitors,
                'week_views' => $weekViews,
                'history' => $history,
            ];
        } catch (\Throwable $e) {
            return $empty;
        }
    }

    /**
     * Pengumuman/promo dari storage/app/announcement.json.
     */
    private function announcement(): ?array
    {
        $path = storage_path('app/announcement.json');
        if (!is_file($path)) {
            return null;
        }

        $data = json_decode((string) @file_get_contents($path), true);
        if (!is_array($data) || empty($data['active'])) {
            return null;
        }

        if (empty($data['title']) && empty($data['text'])) {
            return null;
        }

        $until = $data['until'] ?? null;
        if ($until && ($ts = strtotime((string) $until)) !== false && $ts < time()) {
            return null;
        }

        $type = (string) ($data['type'] ?? 'info');
        if (!in_array($type, ['info', 'promo', 'maintenance'], true)) {
            $type = 'info';
        }

        return [
            'id' => (string) ($data['id'] ?? 'announcement'),
            'title' => (string) ($data['title'] ?? ''),
            'text' => (string) ($data['text'] ?? ''),
            'type' => $type,
            'until' => $until ? (string) $until : null,
        ];
    }
}

/* WIDGETS END */
