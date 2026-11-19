<?php

namespace Pterodactyl\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;
use Symfony\Component\HttpFoundation\Response;

/**
 * Hitung traffic pengunjung panel (pageview + pengunjung unik) di Redis.
 *
 * Yang dihitung cuma request halaman HTML (GET, status 200, content-type
 * text/html). Endpoint JSON kayak /widgets/data, /api/*, dan aset statis
 * otomatis nggak ikut kehitung.
 *
 * /widgets/announcement dipakai sebagai heartbeat: request-nya nggak
 * nambah pageview, tapi bikin pengunjung tetap kelihatan online selama
 * tab panel masih kebuka (polling tiap 60 detik).
 */
class TrackVisitor
{
    /** Pengunjung dianggap online kalau aktif dalam 5 menit terakhir. */
    private const ONLINE_TTL = 300;

    /** Data harian disimpan 40 hari. */
    private const DAILY_TTL = 40 * 86400;

    /** Data mingguan disimpan 15 hari. */
    private const WEEKLY_TTL = 15 * 86400;

    /** Data per jam disimpan 3 hari (buat sparkline 24 jam). */
    private const HOURLY_TTL = 3 * 86400;

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        try {
            // Bot/monitoring (LiveStatus, curl, crawler, dsb) ga dihitung.
            if ($this->isBot($request)) {
                return $response;
            }

            if ($this->isHeartbeat($request)) {
                $this->markOnline($this->visitorKey($request), time());
            } elseif ($this->shouldTrack($request, $response) && !$this->overFloodLimit($request)) {
                $this->track($request);
            }
        } catch (\Throwable $e) {
            // Tracking nggak boleh ganggu request panel.
        }

        return $response;
    }

    /**
     * Deteksi bot / monitoring / tool non-manusia lewat User-Agent.
     * LiveStatus/1.0 (uptime monitor) = penyebab utama pengunjung jadi ribuan.
     */
    private function isBot(Request $request): bool
    {
        $ua = strtolower(trim((string) $request->userAgent()));

        // Nggak ada UA sama sekali -> hampir pasti tool.
        if ($ua === '') {
            return true;
        }

        $signatures = [
            'livestatus', 'uptime', 'monitor', 'probe', 'health', 'pingdom',
            'uptrends', 'seobility', 'ahrefs', 'semrush', 'majestic',
            'bot', 'spider', 'crawler', 'crawl', 'scanner',
            'curl', 'wget', 'python', 'go-http', 'gohttp', 'okhttp', 'libwww',
            'headless', 'facebookexternalhit', 'twitterbot', 'telegrambot',
            'slackbot', 'discordbot', 'linkedinbot', 'applebot',
        ];

        foreach ($signatures as $sig) {
            if (str_contains($ua, $sig)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Anti-flood: satu IP+UA yang request halaman HTML > 60x / menit
     * dianggap flood/bot, stop di-count. Manusia normal < 10 halaman/menit.
     * Dipakai sebagai penahan tambahan kalau ada flood yang lolos UA check.
     */
    private function overFloodLimit(Request $request): bool
    {
        $key = 'traffic:flood:' . sha1($request->ip() . '|' . ($request->userAgent() ?? ''));
        $redis = Redis::connection();
        $n = (int) $redis->incr($key);
        if ($n === 1) {
            $redis->expire($key, 60);
        }

        return $n > 60;
    }

    private function isHeartbeat(Request $request): bool
    {
        return $request->isMethod('GET')
            && $request->user() !== null
            && $request->is('widgets/announcement', 'widgets/data');
    }

    private function shouldTrack(Request $request, Response $response): bool
    {
        if (!$request->isMethod('GET') || $response->getStatusCode() !== 200) {
            return false;
        }

        if ($request->ajax() || $request->expectsJson()) {
            return false;
        }

        $contentType = (string) $response->headers->get('Content-Type');
        if (stripos($contentType, 'text/html') === false) {
            return false;
        }

        // Jangan hitung endpoint internal / aset.
        return !$request->is('api/*', 'widgets/*', 'locales/*');
    }

    private function visitorKey(Request $request): string
    {
        $user = $request->user();
        if ($user) {
            return 'u:' . $user->id;
        }

        if ($request->hasSession()) {
            return 's:' . sha1((string) $request->session()->getId());
        }

        return 'i:' . sha1((string) $request->ip());
    }

    private function markOnline(string $visitor, int $now): void
    {
        Redis::connection()->pipeline(function ($pipe) use ($visitor, $now) {
            $pipe->zadd('traffic:online', $now, $visitor);
            $pipe->zremrangebyscore('traffic:online', 0, $now - self::ONLINE_TTL);
        });
    }

    private function track(Request $request): void
    {
        $visitor = $this->visitorKey($request);
        $now = time();
        $day = date('Y-m-d', $now);
        $hour = date('Y-m-d\TH', $now);
        $week = date('o-\WW', $now);

        Redis::connection()->pipeline(function ($pipe) use ($visitor, $now, $day, $hour, $week) {
            // Pengunjung online (5 menit terakhir).
            $pipe->zadd('traffic:online', $now, $visitor);
            $pipe->zremrangebyscore('traffic:online', 0, $now - self::ONLINE_TTL);

            // Harian: pageview + pengunjung unik.
            $pipe->incr('traffic:views:d:' . $day);
            $pipe->expire('traffic:views:d:' . $day, self::DAILY_TTL);
            $pipe->sadd('traffic:uv:d:' . $day, $visitor);
            $pipe->expire('traffic:uv:d:' . $day, self::DAILY_TTL);

            // Per jam: buat grafik 24 jam.
            $pipe->incr('traffic:views:h:' . $hour);
            $pipe->expire('traffic:views:h:' . $hour, self::HOURLY_TTL);

            // Mingguan: pageview + pengunjung unik.
            $pipe->incr('traffic:views:w:' . $week);
            $pipe->expire('traffic:views:w:' . $week, self::WEEKLY_TTL);
            $pipe->sadd('traffic:uv:w:' . $week, $visitor);
            $pipe->expire('traffic:uv:w:' . $week, self::WEEKLY_TTL);
        });
    }
}
