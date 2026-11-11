<?php

namespace Pterodactyl\Http\Controllers\Music;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MusicUploadController extends Controller
{
    private const MAX_SIZE_KB = 64000; // 64 MB per file
    private const MAX_TRACKS_PER_USER = 25;
    private const MAX_BYTES_PER_USER = 314572800; // 300 MB per akun
    private const EXTENSIONS = ['mp3', 'm4a', 'ogg', 'oga', 'wav', 'flac', 'aac'];

    /**
     * Playlist milik user yang login (per akun, bukan global).
     * GET /music/playlist
     */
    public function index(Request $request): JsonResponse
    {
        $user = $this->user($request);

        $items = array_values(array_filter(
            $this->loadPlaylist(),
            static fn (array $x): bool => (int) ($x['owner_id'] ?? 0) === (int) $user->id
        ));

        // jangan bocorin path internal; cukup title + nama file
        $out = array_map(static fn (array $x): array => [
            'title' => (string) ($x['title'] ?? $x['file'] ?? ''),
            'file' => (string) ($x['file'] ?? ''),
        ], $items);

        return response()->json($out);
    }

    /**
     * Upload lagu ke playlist akun (private, disimpan di storage/app/music).
     * POST /music/upload
     */
    public function store(Request $request): JsonResponse
    {
        $user = $this->user($request);

        $request->validate([
            'music' => ['required', 'file', 'max:' . self::MAX_SIZE_KB],
            'title' => ['nullable', 'string', 'max:120'],
        ]);

        $file = $request->file('music');
        $ext = strtolower($file->getClientOriginalExtension());
        if (!in_array($ext, self::EXTENSIONS, true)) {
            return response()->json(['error' => 'Format tidak didukung. Gunakan: ' . implode(', ', self::EXTENSIONS)], 422);
        }

        // kuota per akun biar disk panel nggak dibanjiri upload
        $mine = array_filter(
            $this->loadPlaylist(),
            static fn (array $x): bool => (int) ($x['owner_id'] ?? 0) === (int) $user->id
        );
        if (count($mine) >= self::MAX_TRACKS_PER_USER) {
            return response()->json(['error' => 'Playlist akun kamu penuh (maks ' . self::MAX_TRACKS_PER_USER . ' lagu). Hapus dulu beberapa.'], 422);
        }
        $used = 0;
        foreach ($mine as $x) {
            $p = $this->mediaDir() . '/' . ($x['file'] ?? '');
            if (is_file($p)) {
                $used += (int) filesize($p);
            }
        }
        if ($used + (int) $file->getSize() > self::MAX_BYTES_PER_USER) {
            return response()->json(['error' => 'Kuota musik akun kamu (300 MB) sudah penuh. Hapus dulu beberapa lagu.'], 422);
        }
        if (@disk_free_space($this->mediaDir()) !== false && disk_free_space($this->mediaDir()) < 2 * 1024 * 1024 * 1024) {
            return response()->json(['error' => 'Disk panel hampir penuh. Hubungi admin.'], 507);
        }

        $title = mb_substr(trim((string) $request->input('title', '')), 0, 100);
        if ($title === '') {
            $title = pathinfo((string) $file->getClientOriginalName(), PATHINFO_FILENAME);
        }

        // sanitize judul jadi nama file yang aman
        $slug = preg_replace('/[^a-zA-Z0-9\p{L}\p{M}_\-]/u', '_', $title);
        $slug = preg_replace('/_+/u', '_', (string) $slug);
        $slug = trim(mb_substr((string) $slug, 0, 80), '_');
        if ($slug === '') {
            $slug = 'lagu';
        }

        $stored = date('Ymd_His') . '_' . substr(md5((string) microtime(true)), 0, 6) . '_' . $slug . '.' . $ext;

        if (!$file->move($this->mediaDir(), $stored)) {
            return response()->json(['error' => 'Gagal menyimpan file.'], 500);
        }

        $this->addToPlaylist($title, $stored, (int) $user->id);

        return response()->json(['title' => $title, 'file' => $stored]);
    }

    /**
     * Hapus lagu milik sendiri (admin utama boleh hapus punya siapa pun).
     * DELETE /music/{file}
     */
    public function destroy(Request $request, string $file): JsonResponse
    {
        $user = $this->user($request);
        $name = basename($file);

        if ($name === 'playlist.json' || str_contains($name, '/')) {
            return response()->json(['error' => 'Tidak bisa dihapus.'], 400);
        }

        $entry = $this->findEntry($name);
        if (!$entry) {
            return response()->json(['error' => 'File tidak ditemukan.'], 404);
        }
        if (!$this->canAccess($user, $entry)) {
            return response()->json(['error' => 'Lagu ini bukan milik akun kamu.'], 403);
        }

        $this->removeFromPlaylist($name);
        $path = $this->mediaDir() . '/' . $name;
        if (is_file($path) && !is_link($path)) {
            @unlink($path);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Stream file privat dengan dukungan Range (biar audio bisa di-seek).
     * GET /music/stream/{file}
     */
    public function stream(Request $request, string $file): StreamedResponse
    {
        $user = $this->user($request);
        $name = basename($file);

        $entry = $this->findEntry($name);
        if (!$entry) {
            abort(404);
        }
        if (!$this->canAccess($user, $entry)) {
            abort(403);
        }

        $path = $this->mediaDir() . '/' . $name;
        if (!is_file($path) || is_link($path)) {
            abort(404);
        }

        $size = (int) filesize($path);
        $start = 0;
        $end = $size > 0 ? $size - 1 : 0;
        $status = 200;

        $range = (string) $request->header('Range', '');
        if ($range !== '' && preg_match('/bytes=(\d*)-(\d*)/i', $range, $m)) {
            if ($m[1] !== '') {
                $start = (int) $m[1];
            }
            if ($m[2] !== '') {
                $end = (int) $m[2];
            }
            if ($m[1] === '' && $m[2] !== '') {
                // suffix range: bytes=-2048
                $start = max(0, $size - (int) $m[2]);
                $end = $size - 1;
            }
            $start = max(0, min($start, $size - 1));
            $end = max($start, min($end, $size - 1));
            $status = 206;
        }

        $length = $size > 0 ? ($end - $start + 1) : 0;
        $mime = @mime_content_type($path) ?: 'application/octet-stream';

        $headers = [
            'Content-Type' => $mime,
            'Content-Length' => (string) $length,
            'Accept-Ranges' => 'bytes',
            'Cache-Control' => 'private, no-store, max-age=0',
            'Content-Disposition' => 'inline; filename="' . addslashes($name) . '"',
        ];
        if ($status === 206) {
            $headers['Content-Range'] = 'bytes ' . $start . '-' . $end . '/' . $size;
        }

        return response()->stream(function () use ($path, $start, $length) {
            $fp = fopen($path, 'rb');
            if (!$fp) {
                return;
            }
            fseek($fp, $start);
            $remaining = $length;
            while ($remaining > 0 && !feof($fp)) {
                $chunk = fread($fp, (int) min(8192, $remaining));
                if ($chunk === false || $chunk === '') {
                    break;
                }
                echo $chunk;
                $remaining -= strlen($chunk);
                if (function_exists('fastcgi_finish_request') === false) {
                    flush();
                }
            }
            fclose($fp);
        }, $status, $headers);
    }

    private function user(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Login dulu');
        }

        return $user;
    }

    private function canAccess($user, array $entry): bool
    {
        if ((int) ($entry['owner_id'] ?? 0) === (int) $user->id) {
            return true;
        }

        // admin utama boleh moderasi semua lagu
        return (int) $user->id === (int) config('pterodactyl.main_admin_id', 0);
    }

    private function mediaDir(): string
    {
        $dir = storage_path('app/music');
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        return $dir;
    }

    private function playlistPath(): string
    {
        return $this->mediaDir() . '/playlist.json';
    }

    private function loadPlaylist(): array
    {
        $raw = @file_get_contents($this->playlistPath());
        $data = $raw ? json_decode($raw, true) : [];

        return is_array($data) ? array_values(array_filter($data, 'is_array')) : [];
    }

    private function savePlaylist(array $items): void
    {
        @file_put_contents(
            $this->playlistPath(),
            json_encode(array_values($items), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }

    private function addToPlaylist(string $title, string $file, int $ownerId): void
    {
        $items = $this->loadPlaylist();
        $items[] = ['title' => $title, 'file' => $file, 'owner_id' => $ownerId];
        $this->savePlaylist($items);
    }

    private function removeFromPlaylist(string $file): void
    {
        $items = array_values(array_filter(
            $this->loadPlaylist(),
            static fn (array $x): bool => ($x['file'] ?? null) !== $file
        ));
        $this->savePlaylist($items);
    }

    private function findEntry(string $file): ?array
    {
        foreach ($this->loadPlaylist() as $x) {
            if (($x['file'] ?? null) === $file) {
                return $x;
            }
        }

        return null;
    }
}
