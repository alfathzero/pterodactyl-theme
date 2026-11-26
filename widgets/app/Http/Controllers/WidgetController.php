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

    /** Spek VPS dicek tiap 15 detik (CPU delta butuh jarak sampel). */
    private const VPS_TTL = 15;

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
            'user' => [
                'username' => (string) $user->username,
                'root_admin' => (bool) $user->root_admin,
                'avatar' => $user->avatar_url,
                'joined' => optional($user->created_at)->toIso8601String(),
            ],
            'network' => $global['network'],
            'traffic' => $this->traffic(),
            'vps' => $this->vpsStats(),
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
     * Spek VPS real-time (CPU/RAM/Disk) dari /proc — VPS yang sama dengan
     * Wings, jadi ga kena dampak flood ke daemon. Cache 15 detik + guard
     * anti-cache-basi (pola sama dengan widgets:global).
     */
    private function vpsStats(): ?array
    {
        $payload = Cache::remember('widgets:vps', self::VPS_TTL, function () {
            return $this->collectVps();
        });

        if (!is_array($payload)) {
            return null;
        }

        // Pengaman: entry cache basi ber-TTL panjang ga boleh di-serve.
        $fetched = (int) ($payload['fetched_at'] ?? 0);
        if ($fetched === 0 || (time() - $fetched) > (int) (self::VPS_TTL * 1.5)) {
            $fresh = $this->collectVps();
            if (is_array($fresh)) {
                $payload = $fresh;
                Cache::put('widgets:vps', $fresh, self::VPS_TTL);
            }
        }

        return isset($payload['vps']) ? $payload['vps'] : null;
    }

    private function collectVps(): array
    {
        $cpu = $this->vpsCpu();
        $ram = $this->vpsRam();
        $disk = $this->vpsDisk();

        if ($cpu === null && $ram === null && $disk === null) {
            // /proc ga bisa dibaca (bukan Linux / env dev) — widget di-hide.
            return [];
        }

        $now = time();

        $this->vpsAppendHistory($now, $cpu['pct'] !== null ? (float) $cpu['pct'] : null, $ram ? (float) $ram['pct'] : null);

        return [
            'fetched_at' => $now,
            'vps' => [
                'cpu_pct' => $cpu['pct'] ?? null,
                'cores' => $cpu['cores'] ?? null,
                'load' => $this->vpsLoad(),
                'ram_used_gb' => $ram['used_gb'] ?? null,
                'ram_total_gb' => $ram['total_gb'] ?? null,
                'ram_pct' => $ram['pct'] ?? null,
                'disk_used_gb' => $disk['used_gb'] ?? null,
                'disk_total_gb' => $disk['total_gb'] ?? null,
                'disk_pct' => $disk['pct'] ?? null,
                'uptime' => $this->vpsUptime(),
                'history_cpu' => $this->vpsHistory('cpu'),
                'history_ram' => $this->vpsHistory('ram'),
            ],
        ];
    }

    /** CPU % dari delta jiffies /proc/stat; sampel terakhir di Redis. */
    private function vpsCpu(): ?array
    {
        $statFile = '/proc/stat';
        if (!is_readable($statFile)) {
            return null;
        }

        $first = null;
        $cores = 0;
        $lines = @file($statFile);
        if (!$lines) {
            return null;
        }
        foreach ($lines as $line) {
            $t = trim($line);
            if (strpos($t, 'cpu ') === 0 && $first === null) {
                $first = $t;
                continue;
            }
            if (strpos($t, 'cpu') === 0) {
                $cores++;
            }
        }
        if ($first === null) {
            return null;
        }

        // "cpu  user nice system idle iowait irq softirq steal guest guest_nice"
        $parts = preg_split('/\s+/', trim(substr($first, 4)));
        $values = array_map('floatval', $parts);
        $idle = ($values[3] ?? 0) + ($values[4] ?? 0);
        $total = array_sum($values);

        $pct = null;
        $now = time();

        try {
            $redis = Redis::connection();
            $prevRaw = $redis->get('vps:cpusample');
            $prev = $prevRaw ? json_decode($prevRaw, true) : null;
            if (is_array($prev) && $now - (int) ($prev['t'] ?? 0) >= 2) {
                $dt = $total - (float) ($prev['total'] ?? 0);
                $di = $idle - (float) ($prev['idle'] ?? 0);
                if ($dt > 0) {
                    $pct = round(100 * (1 - $di / $dt), 1);
                    $pct = max(0, min(100, $pct));
                } else {
                    $pct = $prev['pct'] ?? null;
                }
            } elseif (is_array($prev)) {
                // interval terlalu pendek — pakai angka terakhir
                $pct = $prev['pct'] ?? null;
            }
            $redis->setex('vps:cpusample', 3600, json_encode(['t' => $now, 'total' => $total, 'idle' => $idle, 'pct' => $pct]));
        } catch (\Throwable $e) {
            // Redis mati: CPU % tetap dihitung dari delta berikutnya.
        }

        return ['pct' => $pct, 'cores' => $cores ?: null];
    }

    private function vpsRam(): ?array
    {
        if (!is_readable('/proc/meminfo')) {
            return null;
        }
        $data = @file('/proc/meminfo');
        if (!$data) {
            return null;
        }
        $kv = [];
        foreach ($data as $line) {
            if (strpos($line, ':') === false) {
                continue;
            }
            $bits = explode(':', $line, 2);
            $kv[trim($bits[0])] = (int) trim($bits[1]); // kB
        }
        $total = $kv['MemTotal'] ?? 0;
        $available = $kv['MemAvailable'] ?? $kv['MemFree'] ?? 0;
        if ($total <= 0) {
            return null;
        }
        $used = $total - $available;

        return [
            'used_gb' => round($used / 1048576, 1),
            'total_gb' => round($total / 1048576, 1),
            'pct' => round(100 * $used / $total, 1),
        ];
    }

    private function vpsDisk(): ?array
    {
        $out = @exec('df -B1 / 2>/dev/null', $lines, $code);
        if ($code !== 0 || !isset($lines[1])) {
            return null;
        }
        $f = preg_split('/\s+/', trim($lines[1]));
        if (count($f) < 5) {
            return null;
        }
        $total = (int) $f[1];
        $used = (int) $f[2];
        if ($total <= 0) {
            return null;
        }

        return [
            'used_gb' => round($used / 1073741824, 1),
            'total_gb' => round($total / 1073741824, 1),
            'pct' => round(100 * $used / $total, 1),
        ];
    }

    private function vpsLoad(): ?float
    {
        $line = @file_get_contents('/proc/loadavg');
        if ($line === false) {
            return null;
        }
        $bits = preg_split('/\s+/', trim($line));

        return isset($bits[0]) ? (float) $bits[0] : null;
    }

    private function vpsUptime(): ?string
    {
        $line = @file_get_contents('/proc/uptime');
        if ($line === false) {
            return null;
        }
        $sec = (float) trim(explode(' ', $line)[0]);
        $d = (int) floor($sec / 86400);
        $h = (int) floor($sec / 3600) % 24;
        $m = (int) floor($sec / 60) % 60;
        if ($d > 0) {
            return $d . 'h ' . $h . 'j';
        }
        if ($h > 0) {
            return $h . 'j ' . $m . 'm';
        }

        return $m . 'm';
    }

    /**
     * Sparkline VPS (30 menit, 1 titik/15 dtk). CPU & RAM disimpan dalam
     * satu file JSON; disk tidak di-sparkline (perubahannya terlalu lambat).
     */
    private function vpsHistory(string $key): array
    {
        $path = storage_path('app/vps-history.json');
        if (!is_file($path)) {
            return [];
        }
        $data = json_decode((string) @file_get_contents($path), true);
        if (!is_array($data)) {
            return [];
        }
        $vals = array_map(function ($p) use ($key) {
            return (float) ($p[$key] ?? 0);
        }, array_slice($data, -120));

        return array_values($vals);
    }

    private function vpsAppendHistory(int $now, ?float $cpu, ?float $ram): void
    {
        try {
            $path = storage_path('app/vps-history.json');
            $data = [];
            if (is_file($path)) {
                $decoded = json_decode((string) @file_get_contents($path), true);
                if (is_array($decoded)) {
                    $data = $decoded;
                }
            }
            $last = $data ? (int) ($data[count($data) - 1]['t'] ?? 0) : 0;
            if ($now - $last < 15) {
                return;
            }
            $data[] = ['t' => $now, 'cpu' => $cpu ?? 0, 'ram' => $ram ?? 0];
            $data = array_slice($data, -120);
            $tmp = $path . '.tmp';
            file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            @chmod($tmp, 0644);
            rename($tmp, $path);
        } catch (\Throwable $e) {
            // Sparkline ga boleh ganggu widget utama.
        }
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
