<?php

/* LEADERBOARD START — collector resource server (part of pterodactyl-theme) */

namespace Pterodactyl\Console\Commands;

use GuzzleHttp\Pool;
use GuzzleHttp\Psr7\Request;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;

class CollectLeaderboardCommand extends Command
{
    protected $signature = 'leaderboard:collect {--concurrency=20 : Jumlah request paralel ke Wings}';

    protected $description = 'Ambil resource live semua server buat leaderboard (disimpan ke storage/app/leaderboard.json)';

    public function handle(DaemonServerRepository $repository): int
    {
        $lock = Cache::lock('leaderboard:collect', 300);
        if (!$lock->get()) {
            $this->warn('leaderboard:collect masih jalan, skip run ini.');

            return self::SUCCESS;
        }

        try {
            $started = microtime(true);
            $servers = Server::withoutGlobalScopes()
                ->where(function ($query) {
                    $query->whereNull('status')->orWhere('status', '!=', Server::STATUS_SUSPENDED);
                })
                ->with('node')
                ->get();
            $concurrency = max(1, (int) $this->option('concurrency'));
            $rows = [];
            $errors = 0;

            foreach ($servers->groupBy('node_id') as $nodeServers) {
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
                    'fulfilled' => function ($response, $index) use (&$rows, $list) {
                        $server = $list[$index] ?? null;
                        if (!$server) {
                            return;
                        }

                        $data = json_decode((string) $response->getBody(), true);
                        if (!is_array($data)) {
                            return;
                        }

                        // cuma server yang benar-benar jalan
                        if (($data['state'] ?? 'offline') !== 'running') {
                            return;
                        }

                        $util = is_array($data['utilization'] ?? null) ? $data['utilization'] : [];
                        $memory = (int) ($util['memory_bytes'] ?? 0);
                        $disk = (int) ($util['disk_bytes'] ?? 0);
                        $cpu = (float) ($util['cpu_absolute'] ?? 0);
                        $memoryLimit = (int) $server->memory; // MB
                        $diskLimit = (int) $server->disk;     // MB

                        $rows[] = [
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
                        ];
                    },
                    'rejected' => function () use (&$errors) {
                        $errors++;
                    },
                ]);

                $pool->promise()->wait();
            }

            $payload = [
                'generated_at' => time(),
                'total_online' => count($rows),
                'servers' => $rows,
            ];

            $path = storage_path('app/leaderboard.json');
            $tmp = $path . '.tmp';
            file_put_contents($tmp, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            @chmod($tmp, 0644);
            rename($tmp, $path);

            $elapsed = round(microtime(true) - $started, 2);
            $this->info(sprintf(
                'leaderboard:collect -> %d server online, %d gagal, %ss (concurrency %d)',
                count($rows),
                $errors,
                $elapsed,
                $concurrency
            ));

            return self::SUCCESS;
        } finally {
            $lock->release();
        }
    }
}

/* LEADERBOARD END */
