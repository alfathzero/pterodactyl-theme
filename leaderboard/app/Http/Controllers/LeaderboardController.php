<?php

/* LEADERBOARD START — endpoint leaderboard resource server (part of pterodactyl-theme) */

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Pterodactyl\Models\Server;

class LeaderboardController extends Controller
{
    private const METRICS = ['cpu', 'ram', 'disk'];

    public function index(Request $request): JsonResponse
    {
        if (!$request->user()) {
            abort(401, 'Login dulu');
        }

        $metric = strtolower((string) $request->query('metric', 'cpu'));
        if (!in_array($metric, self::METRICS, true)) {
            $metric = 'cpu';
        }

        $limit = (int) $request->query('limit', 20);
        $limit = max(1, min($limit, 50));

        $raw = @file_get_contents(storage_path('app/leaderboard.json'));
        $data = $raw ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            $data = ['generated_at' => 0, 'total_online' => 0, 'servers' => []];
        }

        $servers = is_array($data['servers'] ?? null) ? $data['servers'] : [];
        $key = ['cpu' => 'cpu', 'ram' => 'memory', 'disk' => 'disk'][$metric];

        usort($servers, static function (array $a, array $b) use ($key): int {
            return ((float) ($b[$key] ?? 0)) <=> ((float) ($a[$key] ?? 0));
        });

        $servers = array_slice($servers, 0, $limit);

        // tandai server milik user biar baris cuma bisa diklik kalau punya akses
        $user = $request->user();
        $ids = array_values(array_filter(array_map(static fn (array $s) => $s['id'] ?? null, $servers)));
        $owners = $ids
            ? Server::withoutGlobalScopes()
                ->whereIn('uuidShort', $ids)
                ->pluck('owner_id', 'uuidShort')
                ->all()
            : [];

        foreach ($servers as &$server) {
            $ownerId = $owners[$server['id'] ?? ''] ?? null;
            $server['owned'] = $user->root_admin || ($ownerId !== null && (int) $ownerId === (int) $user->id);
        }
        unset($server);

        return response()->json([
            'generated_at' => (int) ($data['generated_at'] ?? 0),
            'total_online' => (int) ($data['total_online'] ?? count($servers)),
            'metric' => $metric,
            'servers' => $servers,
        ]);
    }
}

/* LEADERBOARD END */
