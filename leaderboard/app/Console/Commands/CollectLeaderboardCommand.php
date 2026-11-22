<?php

/* LEADERBOARD START — collector resource server (part of pterodactyl-theme) */

namespace Pterodactyl\Console\Commands;

use GuzzleHttp\Pool;
use GuzzleHttp\Psr7\Request;
use Illuminate\Console\Command;
use Pterodactyl\Models\Server;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;

class CollectLeaderboardCommand extends Command
{
    protected $signature = 'leaderboard:collect
        {--concurrency=20 : Jumlah request paralel ke Wings}
        {--timeout=5 : Timeout (detik) per request ke Wings}
        {--connect-timeout=3 : Timeout koneksi (detik) ke Wings}
        {--max-runtime=50 : Batas total waktu run (detik); sisa node dilewati kalau lewat}
        {--grace=180 : Berapa lama (detik) server tetap dianggap online walau gagal dicek ulang}';

    protected $description = 'Ambil resource live semua server buat leaderboard (disimpan ke storage/app/leaderboard.json)';

    public function handle(DaemonServerRepository $repository): int
    {
        // Anti-overlap pakai flock (BUKAN lock Redis): kalau Redis mati pas
        // flood, lock Redis gagal -> collector abort -> widget beku berjam-jam.
        // flock ga bergantung Redis dan auto-lepas kalau proses mati/kena kill.
        $fh = @fopen(storage_path('app/leaderboard.lock'), 'c');
        if ($fh && !flock($fh, LOCK_EX | LOCK_NB)) {
            $this->warn('leaderboard:collect masih jalan, skip run ini.');
            @fclose($fh);

            return self::SUCCESS;
        }

        try {
            $started = microtime(true);
            $now = time();
            $maxRuntime = max(5, (int) $this->option('max-runtime'));
            $grace = max(0, (int) $this->option('grace'));
            $concurrency = max(1, (int) $this->option('concurrency'));
            $timeout = max(1, (int) $this->option('timeout'));
            $connectTimeout = max(1, (int) $this->option('connect-timeout'));

            $path = storage_path('app/leaderboard.json');

            // Snapshot online sebelumnya — dipakai buat "sticky online".
            $prevOnline = [];
            if (is_file($path)) {
                $prev = json_decode((string) @file_get_contents($path), true);
                if (is_array($prev) && isset($prev['servers']) && is_array($prev['servers'])) {
                    foreach ($prev['servers'] as $r) {
                        if (isset($r['id'])) {
                            $prevOnline[$r['id']] = $r;
                        }
                    }
                }
            }

            $servers = Server::withoutGlobalScopes()
                ->where(function ($query) {
                    $query->whereNull('status')->orWhere('status', '!=', Server::STATUS_SUSPENDED);
                })
                ->with('node')
                ->get();

            // identifier yang masih ada di DB — biar sticky gak nge-hold server
            // yang udah dihapus.
            $validIds = [];
            foreach ($servers as $server) {
                $validIds[$server->identifier] = true;
            }

            // Timeout pendek per-request: Wings yang lagi kebanjiran ga nyeret
            // satu collect sampai ratusan detik (penyebab widget beku).
            $reqOptions = ['timeout' => $timeout, 'connect_timeout' => $connectTimeout];

            $fresh = [];             // identifier => row (running, data baru)
            $confirmedOffline = [];  // identifier => true (Wings jawab bukan running)
            $errors = 0;
            $deadlineHit = false;

            foreach ($servers->groupBy('node_id') as $nodeServers) {
                if ((microtime(true) - $started) > $maxRuntime) {
                    $deadlineHit = true;
                    break;
                }

                $node = $nodeServers->first()->node;
                if (!$node) {
                    continue;
                }

                $list = array_values($nodeServers->all());
                $client = $repository->setNode($node)->getHttpClient();

                $requests = function () use ($list) {
                    foreach ($list as $index => $server) {
                        yield $index => new Request('GET', sprintf('/api/servers/%s', $server->uuid));
                    }
                };

                $pool = new Pool($client, $requests(), [
                    'concurrency' => $concurrency,
                    'options' => $reqOptions,
                    'fulfilled' => function ($response, $index) use (&$fresh, &$confirmedOffline, $list, $now) {
                        $server = $list[$index] ?? null;
                        if (!$server) {
                            return;
                        }

                        $data = json_decode((string) $response->getBody(), true);
                        // Respons rusak/blank: anggap UNKNOWN (jangan dianggap mati),
                        // biar sticky nahan status sebelumnya.
                        if (!is_array($data)) {
                            return;
                        }

                        // Wings jawab eksplisit -> kalau bukan running, beneran mati.
                        if (($data['state'] ?? 'offline') !== 'running') {
                            $confirmedOffline[$server->identifier] = true;
                            return;
                        }

                        $util = is_array($data['utilization'] ?? null) ? $data['utilization'] : [];
                        $memory = (int) ($util['memory_bytes'] ?? 0);
                        $disk = (int) ($util['disk_bytes'] ?? 0);
                        $cpu = (float) ($util['cpu_absolute'] ?? 0);
                        $memoryLimit = (int) $server->memory; // MB
                        $diskLimit = (int) $server->disk;     // MB

                        $fresh[$server->identifier] = [
                            'id' => $server->identifier,
                            'name' => $server->name,
                            'node' => $server->node->name ?? '',
                            'cpu' => round($cpu, 2),
                            'memory' => $memory,
                            'disk' => $disk,
                            'memory_limit' => $memoryLimit,
                            'disk_limit' => $diskLimit,
                            'memory_pct' => $memoryLimit > 0 ? round($memory / ($memoryLimit * 1048576) * 100, 1) : null,
                            'disk_pct' => $diskLimit > 0 ? round($disk / ($diskLimit * 1048576) * 100, 1) : null,
                            // Wings ngirim uptime dalam milliseconds, simpan sebagai detik
                            'uptime' => (int) round(((float) ($util['uptime'] ?? 0)) / 1000),
                            'seen' => $now,
                        ];
                    },
                    'rejected' => function () use (&$errors) {
                        // Timeout / koneksi gagal = UNKNOWN, bukan mati.
                        $errors++;
                    },
                ]);

                $pool->promise()->wait();
            }

            // Susun daftar online = yang fresh (running) + sticky (carry-forward
            // yang belum dikonfirmasi mati dan masih dalam grace).
            $rows = $fresh;
            foreach ($prevOnline as $id => $row) {
                if (isset($fresh[$id])) {
                    continue;            // udah dapet data baru
                }
                if (isset($confirmedOffline[$id])) {
                    continue;            // Wings konfirmasi mati -> drop
                }
                if (!isset($validIds[$id])) {
                    continue;            // server udah ga ada di DB -> drop
                }
                $seen = (int) ($row['seen'] ?? 0);
                if ($grace > 0 && $seen > 0 && ($now - $seen) > $grace) {
                    continue;            // terlalu lama ga terkonfirmasi -> drop
                }
                $rows[$id] = $row;        // sticky: pakai data terakhir
            }
            $rows = array_values($rows);

            // Jangan timpa data bagus dengan hasil kosong kalau run ini ga
            // meyakinkan (banyak gagal / kena deadline) dan kita punya data lama.
            if (count($rows) === 0 && ($errors > 0 || $deadlineHit) && count($prevOnline) > 0) {
                $this->warn(sprintf(
                    'leaderboard:collect -> 0 online, %d gagal (deadline=%s); data lama (%d online) dipertahankan',
                    $errors,
                    $deadlineHit ? 'ya' : 'tidak',
                    count($prevOnline)
                ));

                return self::SUCCESS;
            }

            $payload = [
                'generated_at' => $now,
                'total_online' => count($rows),
                'servers' => $rows,
            ];

            $tmp = $path . '.tmp';
            file_put_contents($tmp, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            @chmod($tmp, 0644);
            rename($tmp, $path);

            // History 60 titik buat sparkline widget Status Jaringan.
            $historyPath = storage_path('app/leaderboard-history.json');
            $history = [];
            if (is_file($historyPath)) {
                $decoded = json_decode((string) @file_get_contents($historyPath), true);
                if (is_array($decoded)) {
                    $history = $decoded;
                }
            }
            $history[] = ['t' => $now, 'online' => count($rows)];
            $history = array_slice($history, -60);
            $historyTmp = $historyPath . '.tmp';
            file_put_contents($historyTmp, json_encode($history, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            @chmod($historyTmp, 0644);
            rename($historyTmp, $historyPath);

            $elapsed = round(microtime(true) - $started, 2);
            $this->info(sprintf(
                'leaderboard:collect -> %d online (fresh %d, sticky %d), %d gagal, %ss (concurrency %d)',
                count($rows),
                count($fresh),
                count($rows) - count($fresh),
                $errors,
                $elapsed,
                $concurrency
            ));

            return self::SUCCESS;
        } finally {
            if (isset($fh) && $fh) {
                @flock($fh, LOCK_UN);
                @fclose($fh);
            }
        }
    }
}

/* LEADERBOARD END */
