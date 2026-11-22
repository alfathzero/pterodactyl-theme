<?php

/* WIDGETS START — admin pengumuman dashboard (part of pterodactyl-theme) */

namespace Pterodactyl\Http\Controllers\Admin;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\View\View;
use Pterodactyl\Http\Controllers\Controller;

class WidgetController extends Controller
{
    /**
     * Form edit pengumuman/promo dashboard.
     */
    public function index(): View
    {
        return view('admin.widgets.index', [
            'announcement' => $this->read(),
        ]);
    }

    /**
     * Simpan pengumuman ke storage/app/announcement.json.
     */
    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'title' => 'nullable|string|max:120',
            'text' => 'nullable|string|max:1000',
            'type' => 'required|in:info,promo,maintenance',
            'until' => 'nullable|date',
            'active' => 'nullable|boolean',
        ]);

        $current = $this->read() ?? [];

        $payload = [
            'title' => trim((string) ($data['title'] ?? '')),
            'text' => trim((string) ($data['text'] ?? '')),
            'type' => (string) $data['type'],
            'until' => !empty($data['until']) ? date('c', strtotime((string) $data['until'])) : null,
            'active' => $request->boolean('active'),
            'updated_at' => date('c'),
        ];

        // Kalau isi berubah, bikin ID baru biar user yang pernah dismiss
        // tetap lihat pengumuman terbaru.
        $changed = ($current['title'] ?? '') !== $payload['title']
            || ($current['text'] ?? '') !== $payload['text'];

        $payload['id'] = ($changed || empty($current['id']))
            ? (string) Str::uuid()
            : (string) $current['id'];

        $path = storage_path('app/announcement.json');
        $tmp = $path . '.tmp';
        file_put_contents($tmp, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        @chmod($tmp, 0644);
        rename($tmp, $path);

        return redirect()
            ->route('admin.widgets')
            ->with('success', $payload['active'] ? 'Pengumuman disimpan & aktif di dashboard.' : 'Pengumuman disimpan (nonaktif).');
    }

    private function read(): ?array
    {
        $path = storage_path('app/announcement.json');
        if (!is_file($path)) {
            return null;
        }

        $data = json_decode((string) @file_get_contents($path), true);

        return is_array($data) ? $data : null;
    }
}

/* WIDGETS END */
