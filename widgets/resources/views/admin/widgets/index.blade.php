@extends('layouts.admin')

@section('title')
    Widget & Pengumuman
@endsection

@section('content-header')
    <h1>Widget &amp; Pengumuman<small>Atur banner promo / info di dashboard dan halaman server.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Widget &amp; Pengumuman</li>
    </ol>
@endsection

@section('content')
<style>
    .wg-form .form-control {
        background: #0b1220 !important;
        color: #e5e7eb !important;
        border: 1px solid rgba(148, 163, 184, 0.28) !important;
        border-radius: 10px;
        box-shadow: none;
        transition: border-color .15s ease, box-shadow .15s ease;
    }
    .wg-form .form-control:focus {
        border-color: #6366f1 !important;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18) !important;
    }
    .wg-form .form-control::placeholder { color: rgba(148, 163, 184, 0.45); }
    .wg-form select.form-control option { background: #0b1220; color: #e5e7eb; }
    .wg-form input[type="datetime-local"] { color-scheme: dark; }
    .wg-form label { color: #cbd5e1; font-weight: 600; }
    .wg-form .help-block { color: rgba(148, 163, 184, 0.65) !important; }

    .wg-toggle-row { margin: 6px 0 4px; }
    .wg-toggle-row > input {
        position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none;
    }
    .wg-toggle {
        display: flex; align-items: center; gap: 12px;
        width: 100%; margin: 0;
        padding: 12px 14px;
        border-radius: 12px;
        cursor: pointer;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(255, 255, 255, 0.03);
        transition: border-color .15s ease, background .15s ease;
        user-select: none;
    }
    .wg-toggle:hover { background: rgba(255, 255, 255, 0.06); }
    .wg-switch {
        position: relative; flex: 0 0 auto;
        width: 46px; height: 26px;
        border-radius: 9999px;
        background: rgba(148, 163, 184, 0.32);
        transition: background .18s ease;
    }
    .wg-knob {
        position: absolute; top: 3px; left: 3px;
        width: 20px; height: 20px; border-radius: 9999px;
        background: #fff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
        transition: transform .18s ease;
    }
    .wg-toggle-row > input:checked + .wg-toggle {
        border-color: rgba(34, 197, 94, 0.45);
        background: rgba(34, 197, 94, 0.08);
    }
    .wg-toggle-row > input:checked + .wg-toggle .wg-switch {
        background: linear-gradient(90deg, #22c55e, #16a34a);
    }
    .wg-toggle-row > input:checked + .wg-toggle .wg-knob { transform: translateX(20px); }
    .wg-toggle-row > input:focus-visible + .wg-toggle {
        outline: 2px solid #6366f1; outline-offset: 2px;
    }
    .wg-toggle-text { flex: 1 1 auto; line-height: 1.35; }
    .wg-toggle-text b { display: block; color: #e5e7eb; font-size: 13.5px; }
    .wg-toggle-text small { color: rgba(148, 163, 184, 0.75); font-size: 11.5px; }
    .wg-toggle-state {
        flex: 0 0 auto;
        font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
        padding: 3px 9px; border-radius: 9999px;
        color: #f87171;
        border: 1px solid rgba(248, 113, 113, 0.35);
        background: rgba(248, 113, 113, 0.1);
    }
    .wg-toggle-row > input:checked + .wg-toggle .wg-toggle-state {
        color: #4ade80;
        border-color: rgba(34, 197, 94, 0.4);
        background: rgba(34, 197, 94, 0.12);
    }

    .wg-preview {
        border-radius: 14px;
        padding: 14px 16px;
        color: #e5e7eb;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background:
            radial-gradient(120% 140% at 100% 0%, rgba(99, 102, 241, 0.16), transparent 55%),
            linear-gradient(160deg, #0b1220 0%, #0f172a 60%, #0a0f1d 100%);
        transition: opacity .2s ease;
    }
    .wg-preview-type {
        font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
        opacity: .7; margin-bottom: 6px; font-weight: 700;
    }
    .wg-preview-title { font-weight: 700; margin-bottom: 4px; font-size: 14px; }
    .wg-preview-text { font-size: 13px; opacity: .85; word-break: break-word; }
</style>

<div class="row">
    <div class="col-md-7">
        <div class="box box-primary">
            <div class="box-header with-border">
                <h3 class="box-title">Banner Dashboard</h3>
            </div>
            <form method="POST" action="{{ route('admin.widgets.update') }}" id="w-form" class="wg-form">
                @csrf
                <div class="box-body">
                    @if (session('success'))
                        <div class="alert alert-success">{{ session('success') }}</div>
                    @endif

                    <div class="form-group">
                        <label for="w-title">Judul</label>
                        <input type="text" name="title" id="w-title" class="form-control"
                               maxlength="120" value="{{ old('title', $announcement['title'] ?? '') }}"
                               placeholder="Contoh: Promo Diskon 50%">
                        @error('title')<span class="text-danger">{{ $message }}</span>@enderror
                    </div>

                    <div class="form-group">
                        <label for="w-text">Isi Pengumuman</label>
                        <textarea name="text" id="w-text" class="form-control" rows="4" maxlength="1000"
                                  placeholder="Tulis info promo, maintenance, atau pengumuman lain...">{{ old('text', $announcement['text'] ?? '') }}</textarea>
                        <p class="help-block">Maksimal 1000 karakter. Boleh kosong kalau cuma mau judul.</p>
                        @error('text')<span class="text-danger">{{ $message }}</span>@enderror
                    </div>

                    <div class="row">
                        <div class="col-sm-6">
                            <div class="form-group">
                                <label for="w-type">Tipe</label>
                                <select name="type" id="w-type" class="form-control">
                                    @php($type = old('type', $announcement['type'] ?? 'info'))
                                    <option value="info" @if($type === 'info') selected @endif>📢 Info</option>
                                    <option value="promo" @if($type === 'promo') selected @endif>🎉 Promo</option>
                                    <option value="maintenance" @if($type === 'maintenance') selected @endif>🛠️ Maintenance</option>
                                </select>
                                @error('type')<span class="text-danger">{{ $message }}</span>@enderror
                            </div>
                        </div>
                        <div class="col-sm-6">
                            <div class="form-group">
                                <label for="w-until">Berakhir (opsional)</label>
                                <input type="datetime-local" name="until" id="w-until" class="form-control"
                                       value="{{ old('until', !empty($announcement['until']) ? date('Y-m-d\TH:i', strtotime($announcement['until'])) : '') }}">
                                <p class="help-block">Kosongkan kalau tampil terus.</p>
                                @error('until')<span class="text-danger">{{ $message }}</span>@enderror
                            </div>
                        </div>
                    </div>

                    <div class="wg-toggle-row">
                        <input type="checkbox" id="w-active" name="active" value="1"
                               @if(old('active', $announcement['active'] ?? false)) checked @endif>
                        <label for="w-active" class="wg-toggle">
                            <span class="wg-switch"><span class="wg-knob"></span></span>
                            <span class="wg-toggle-text">
                                <b>Tampilkan di dashboard</b>
                                <small>Tap baris ini buat aktif / nonaktif</small>
                            </span>
                            <span class="wg-toggle-state" id="w-active-state">Nonaktif</span>
                        </label>
                    </div>
                </div>
                <div class="box-footer">
                    <button type="submit" class="btn btn-primary">
                        <i class="fa fa-save"></i> Simpan
                    </button>
                    @if (!empty($announcement['id']))
                        <span class="text-muted" style="margin-left:10px;">
                            ID: <code>{{ $announcement['id'] }}</code>
                        </span>
                    @endif
                </div>
            </form>
        </div>
    </div>

    <div class="col-md-5">
        <div class="box box-default">
            <div class="box-header with-border">
                <h3 class="box-title">Preview</h3>
            </div>
            <div class="box-body">
                <div class="wg-preview" id="w-preview">
                    <div class="wg-preview-type" id="w-preview-type">📢 Info</div>
                    <div class="wg-preview-title" id="w-preview-title">{{ !empty($announcement['title']) ? $announcement['title'] : 'Judul pengumuman' }}</div>
                    <div class="wg-preview-text" id="w-preview-text">{{ !empty($announcement['text']) ? $announcement['text'] : 'Isi pengumuman muncul di sini.' }}</div>
                </div>
                <p class="help-block" style="margin-top:12px;">
                    Preview update langsung pas lu ngetik. Banner muncul di paling atas dashboard user
                    <b>dan di semua halaman server</b> (console, files, dll), bisa ditutup, dan bakal muncul
                    lagi kalau isinya diganti.
                </p>
            </div>
        </div>

        <div class="box box-default">
            <div class="box-header with-border">
                <h3 class="box-title">Notifikasi Browser</h3>
            </div>
            <div class="box-body">
                <p>Pas pengumuman aktif, user bakal diminta <b>izin notifikasi browser</b>. Setelah diizinkan,
                   notif muncul sekali per pengumuman — termasuk kalau mereka lagi buka halaman server.</p>
                <p class="text-muted">Klik notif bakal fokus ke panel dan sorot bannernya (dashboard maupun
                   halaman server). Mau kirim ulang notif? Ubah sedikit judul/teks biar ID pengumuman baru.</p>
                <p class="text-muted" style="margin-bottom:0;">Catatan: notif cuma jalan selama panel masih kebuka
                   di salah satu tab user. Notif saat panel ditutup total butuh Web Push (belum aktif).</p>
            </div>
        </div>

        <div class="box box-default">
            <div class="box-header with-border">
                <h3 class="box-title">Widget Dashboard</h3>
            </div>
            <div class="box-body">
                <p>Widget ini otomatis tampil di dashboard, nggak perlu setting:</p>
                <ul style="padding-left:18px;">
                    <li>🌐 Status Jaringan</li>
                    <li>🖥️ Server Saya</li>
                    <li>📊 Kuota Resource</li>
                    <li>🛰️ Node Health</li>
                </ul>
                <p class="text-muted" style="margin-bottom:0;">
                    Data status diambil dari cache leaderboard (update tiap menit).
                </p>
            </div>
        </div>
    </div>
</div>

<script>
(function () {
    var form = document.getElementById('w-form');
    if (!form) return;

    var title = document.getElementById('w-title');
    var text = document.getElementById('w-text');
    var type = document.getElementById('w-type');
    var active = document.getElementById('w-active');
    var stateLabel = document.getElementById('w-active-state');
    var pBox = document.getElementById('w-preview');
    var pTitle = document.getElementById('w-preview-title');
    var pText = document.getElementById('w-preview-text');
    var pType = document.getElementById('w-preview-type');

    var TYPES = {
        info: '📢 Info',
        promo: '🎉 Promo',
        maintenance: '🛠️ Maintenance'
    };

    function render() {
        pTitle.textContent = title.value.trim() || 'Judul pengumuman';
        pText.textContent = text.value.trim() || 'Isi pengumuman muncul di sini.';
        pType.textContent = TYPES[type.value] || TYPES.info;
        stateLabel.textContent = active.checked ? 'Aktif' : 'Nonaktif';
        pBox.style.opacity = active.checked ? '1' : '0.55';
    }

    form.addEventListener('input', render);
    form.addEventListener('change', render);
    render();
})();
</script>
@endsection
