<?php

/* LEADERBOARD START — endpoint leaderboard resource server (part of pterodactyl-theme) */

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

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

        return response()->json([
            'generated_at' => (int) ($data['generated_at'] ?? 0),
            'total_online' => (int) ($data['total_online'] ?? count($servers)),
            'metric' => $metric,
            'servers' => array_slice($servers, 0, $limit),
        ]);
    }
}

/* LEADERBOARD END */
