# Pterodactyl Theme Pack 🌙

Tema gelap glass + animasi buat **Pterodactyl Panel 1.11+** (Ubuntu 24.04 / PHP 8.3, tidak perlu rebuild React — 100% CSS/JS injeksi lewat blade template).

Dibuat buat **alfa-marketdua-officialss.alfamarket2.my.id** — bebas dipakai ulang.

## Fitur

| Bagian | Fitur |
|---|---|
| 🔐 Halaman Login | Background globe titik 3D muter (canvas, tanpa CDN), ripple + gelombang kejut pas disentuh, globe spin kick, 2 orbit ring + satelit, card 3D tilt ngikutin mouse/jari |
| 🏝 Dynamic Island | Pil melayang ala iPhone: jam live WIB (`Asia/Jakarta`) + cuaca real-time (Open-Meteo, koordinat Bekasi Selatan). Bisa digeser kanan-kiri (posisi keingat), usap ke atas buat sembunyi, usap dari tepi atas / tap handle buat manggil |
| 🖥 Dashboard | Daftar server jadi glass card, avatar icon gradient ungu, server ON glow hijau napas + bar status pulse, di HP tampil detail IP, CPU%, RAM, Disk per server |
| 📊 Console | Kotak stats (Address/Uptime/CPU/Memory/Disk/Network) jadi glowing glass + **bar progress live** warna ijo→kuning→merah + grafik blok ikut ngaca |
| 🎧 Orb Spotify-style | Tombol melayang pojok kanan bawah (logo Spotify, muter + glow pas main). Tap: panel player — play/pause, stop, next/prev, bar progress bisa di-seek, nama + link lagu, playlist (tambah/hapus/pilih, keingat di localStorage) |
| 📁 Files & halaman lain | Background gradient gelap, nav glass, tombol membulat + hover lift, baris file ngaca halus, animasi masuk berjenjang, highlight table |

Semua animasi otomatis nonaktif kalau OS pakai `prefers-reduced-motion`.

## Install

```bash
git clone https://github.com/USERNAME/pterodactyl-theme.git
cd pterodactyl-theme
sudo ./install.sh
```

Panel bukan di `/var/www/pterodactyl`?

```bash
sudo PANEL_DIR=/path/ke/panel ./install.sh
```

Lalu **hard refresh** browser (`Ctrl+Shift+R`) atau buka Incognito — kalau lewat Cloudflare, file CSS/JS pakai query `?v=` supaya tembus cache.

## Uninstall

```bash
sudo ./uninstall.sh
```

Backup blade asli (`*.bak-theme`) dikembalikan, file tema dihapus, panel balik default.

## Struktur

```
assets/        custom-auth-3d.css|js   -> public/assets/ (login)
               custom-island.css|js    -> public/assets/ (island)
               custom-stats.js         -> public/assets/ (bar progress console)
               custom-anim.css         -> public/assets/ (tema + animasi global)
templates/     base-core.blade.php     -> resources/views/templates/base/core.blade.php
               auth-core.blade.php     -> resources/views/templates/auth/core.blade.php
install.sh     installer (backup dulu, idempotent)
uninstall.sh   restore dari backup
```

## Catatan

- `templates/base-core.blade.php` mengandung blok **SANO NEON** (toast "Selamat Pagi/Siang/Malam, Hai <user> 👋" neon) di dalam `@section('container')`. Mau buang? Hapus bagian di antara `{{-- START: SANO NEON --}}` sampai `{{-- END: SANO NEON --}}`.
- Cuaca island pakai [Open-Meteo](https://open-meteo.com) (gratis, tanpa API key). Koordinat Bekasi Selatan ada di `assets/custom-island.js` (`WX_URL`, lat `-6.27` lon `106.99`) — ganti buat kota lain.
- Kalau habis `composer update` / upgrade panel lalu tema ilang, jalanin ulang `./install.sh`.
- Selector animasi dashboard pakai `a[href^="/server/"]:has(.status-bar)` biar ga kena link file manager (itu bug lama, udah dibenerin).

## Lisensi

MIT — pakai, modifikasi, sebar bebas. Attribution dihargai 🤙
