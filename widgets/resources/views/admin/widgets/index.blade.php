@extends('layouts.admin')

@section('title')
    Widget & Pengumuman
@endsection

@section('content-header')
    <h1>Widget &amp; Pengumuman<small>Atur banner promo / info di dashboard user.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Widget &amp; Pengumuman</li>
    </ol>
@endsection

@section('content')
<div class="row">
    <div class="col-md-7">
        <div class="box box-primary">
            <div class="box-header with-border">
                <h3 class="box-title">Banner Dashboard</h3>
            </div>
            <form method="POST" action="{{ route('admin.widgets.update') }}">
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
                                <p class="help-block">Kosongkan kalau pengumuman tampil terus.</p>
                                @error('until')<span class="text-danger">{{ $message }}</span>@enderror
                            </div>
                        </div>
                    </div>

                    <div class="checkbox">
                        <label>
                            <input type="checkbox" name="active" value="1"
                                   @if(old('active', $announcement['active'] ?? false)) checked @endif>
                            Tampilkan di dashboard
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
                @php($pType = old('type', $announcement['type'] ?? 'info'))
                <div style="border-radius:14px; padding:14px 16px; color:#e5e7eb;
                            border:1px solid rgba(148,163,184,.25);
                            background:linear-gradient(160deg,#0b1220,#0f172a);">
                    <div style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.65; margin-bottom:6px;">
                        @if($pType === 'promo') 🎉 Promo
                        @elseif($pType === 'maintenance') 🛠️ Maintenance
                        @else 📢 Info
                        @endif
                    </div>
                    <div style="font-weight:700; margin-bottom:4px;">
                        {{ old('title', $announcement['title'] ?? '') ?: 'Judul pengumuman' }}
                    </div>
                    <div style="font-size:13px; opacity:.85;">
                        {{ old('text', $announcement['text'] ?? '') ?: 'Isi pengumuman muncul di sini.' }}
                    </div>
                </div>
                <p class="help-block" style="margin-top:12px;">
                    Banner muncul di paling atas dashboard user. User bisa menutupnya,
                    dan bakal muncul lagi kalau isi pengumuman diganti.
                </p>
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
@endsection
