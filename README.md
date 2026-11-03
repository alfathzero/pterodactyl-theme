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
| 🎧 Orb Menu | Satu orb melayang pojok kanan bawah (tap → mekar 3 bola): **💬 Chat Room**, **✈️ Developer Telegram** (link + nama dev), **🎵 Musik**. Player musik: play/pause, stop, next/prev, bar progress bisa di-seek, playlist (tambah/hapus/pilih). **Import lagu dari file lokal HP** (IndexedDB, awet walau refresh) atau dari link MP3 |
| 💬 Chat Room | Chat global antar user panel pake identitas akun (username + avatar + badge ADMIN). Polling 2.5 detik, emoji reaksi (6), **@mention** autocomplete, hapus pesan (diri/admin), **mute user** (10m/1j/24j, admin only), online count, anti-spam & rate-limit, XSS-safe. **Notifikasi browser** (tab background) + suara + badge unread. Butuh `chat-install.sh` (nyentuh app code + DB) |
| 📁 Files & halaman lain | Background gradient gelap, nav glass, tombol membulat + hover lift, baris file ngaca halus, animasi masuk berjenjang, highlight table |

Semua animasi otomatis nonaktif kalau OS pakai `prefers-reduced-motion`.

---

## 📖 Tutorial pasang di VPS lain (perlahan, step-by-step)

> Syarat: Pterodactyl Panel **sudah terinstall & jalan** di VPS itu, dan lu punya akses **root** via SSH.

### Step 1 — SSH ke VPS tujuan

```bash
ssh root@IP-VPS-TUJUAN
# contoh: ssh root@203.0.113.10
```
Kirim password root / pakai key sesuai setup VPS lu.

### Step 2 — Pastiin git ada

```bash
git --version || apt update && apt install -y git
```

### Step 3 — Clone repo-nya

```bash
git clone https://github.com/alfathzero/pterodactyl-theme.git
cd pterodactyl-theme
```

### Step 4 — Jalankan installer

```bash
sudo chmod +x install.sh
sudo ./install.sh
```

Output sukses kurang lebih:
```
[*] Panel : /var/www/pterodactyl
[1/4] Copy assets (css/js)...
[2/4] Deploy blade templates...
[3/4] Clear view cache...
[4/4] Fix permissions...
[✓] Selesai!
```

> **Panel lu ga di `/var/www/pterodactyl`?** Tentuin folder-nya:
> ```bash
> sudo PANEL_DIR=/var/www/panel ./install.sh
> ```
> Cara cek letak panel: cari folder yang ada file `artisan`, misal `ls /var/www/*/artisan`.

### Step 5 — (Opsional) Pasang Chat Room

Mau fitur chat global antar user? Jalankan **setelah** `install.sh`:

```bash
sudo ./chat-install.sh
```

> ⚠️ Ini beda sama tema — dia nyentuh **app code panel** (controller/model/migration/route) + bikin 3 tabel DB (`chat_*`). Kalau ga mau, skip aja, tema tetap jalan normal (tombol chat di orb cuma diem).

### Step 6 — Bersihin cache view (kalau installer ga kebaca perubahan)

```bash
cd /var/www/pterodactyl        # masuk ke folder panel lu
sudo -u www-data php artisan view:clear
```

### Step 7 — Buang cache browser

- HP: buka panel di **tab Incognito**, atau
- Hapus cache: Chrome → ⋮ → Settings → Privacy → *Clear browsing data* → centang **Cached images and files**
- Laptop: **Ctrl+Shift+R** di halaman panel

> Lewat **Cloudflare** proxy? File tema pakai query `?v=` jadi biasanya langsung tembus. Kalau masih ga muncul: Cloudflare dashboard → Caching → *Purge Cache* (purge everything sekali aja).

### Step 8 — Cek hasil

| Halaman | Yang harus keliatan |
|---|---|
| `/auth/login` | Globe titik 3D + ripple pas disentuh |
| Dashboard | Island jam+cuaca di atas, daftar server glass |
| Halaman server | Bar progress warna-warni di stats |
| Pojok kanan bawah | Orb menu (tap → Chat Room 💬 / Telegram ✈️ / Musik 🎵) |

---

## 🔄 Update tema ke versi terbaru

```bash
cd pterodactyl-theme
git pull
sudo ./install.sh
sudo ./chat-install.sh   # kalau pakai Chat Room
```

> `chat-install.sh` idempotent — aman dijalankan ulang, dan WAJIB dijalankan lagi **setelah upgrade panel** (upgrade panel nimpa `routes/base.php`, bikin route chat ilang → chat jadi 404).

Lalu hard refresh browser lagi (file tema selalu naik versi `?v=`-nya).

## 🗑 Uninstall (balik default)

```bash
cd pterodactyl-theme
sudo ./chat-uninstall.sh   # hapus Chat Room dulu (opsional)
sudo ./uninstall.sh
```

Template asli (yang ke-backup `*.bak-theme` pas install) dibalikin, file tema dihapus. `chat-uninstall.sh` restore `routes/base.php`, buang file backend chat, & (kalau lu mau) drop tabel `chat_*`.

## 🛠 Troubleshooting

| Masalah | Solusi |
|---|---|
| `[!] Panel ga ketemu` | Jalanin pakai `PANEL_DIR=/lokasi/panel sudo -E ./install.sh` |
| Tema muncul separo / lama | Cache view: `sudo -u www-data php artisan view:clear` + purge cache browser/Cloudflare |
| Island ga muncul | Pastiin lu login sebagai user (halaman panel), bukan halaman admin lama; hard refresh |
| Cuaca island ga muncul | HP ga bisa akses `api.open-meteo.com`? Cek koneksi/adblock |
| Orb player ga mau muter file HP | Browser harus mendukung IndexedDB (Chrome/Firefox baru). Jangan pakai Private mode lama |
| Chat Room 404 / tombol chat diem | Habis upgrade panel? `sudo ./chat-install.sh` lagi (route-nya ke-timpa). Kalau tombol diem doang: `chat-install.sh` belum pernah dijalankan |
| Chat ga mau kirim (429) | Rate limit: 20 pesan/menit atau kedetect spam — tunggu sebentar |
| Habis upgrade panel tema ilang | Wajar, blade ke-overwrite. Tinggal `git pull && sudo ./install.sh && sudo ./chat-install.sh` lagi |

## Struktur

```
assets/        custom-auth-3d.css|js   -> public/assets/ (login)
               custom-island.css|js    -> public/assets/ (island)
               custom-stats.js         -> public/assets/ (bar progress console)
               custom-orb.css|js       -> public/assets/ (orb menu: chat/tg/musik + player)
               custom-chat.css|js      -> public/assets/ (window chat)
               custom-anim.css         -> public/assets/ (tema + animasi global)
chat/          app/ + database/ + routes/  -> app code panel (ChatController, models, migration, route)
               sw-notify.js            -> public/sw-notify.js (service worker notifikasi chat)
templates/     base-core.blade.php     -> resources/views/templates/base/core.blade.php
               auth-core.blade.php     -> resources/views/templates/auth/core.blade.php
install.sh         installer tema (backup dulu, idempotent)
chat-install.sh    installer Chat Room (app code + DB, idempotent; jalankan lagi habis upgrade panel)
chat-uninstall.sh  buang Chat Room (restore route, hapus file, opsional drop tabel)
uninstall.sh       restore tema dari backup
```

## Catatan

- `templates/base-core.blade.php` mengandung blok **SANO NEON** (toast "Selamat Pagi/Siang/Malam, Hai <user> 👋" neon) di dalam `@section('container')`. Mau buang? Hapus bagian di antara `{{-- START: SANO NEON --}}` sampai `{{-- END: SANO NEON --}}`.
- Cuaca island pakai [Open-Meteo](https://open-meteo.com) (gratis, tanpa API key). Koordinat Bekasi Selatan ada di `assets/custom-island.js` (`WX_URL`, lat `-6.27` lon `106.99`) — ganti buat kota lain.
- Playlist orb ke-simpen di **browser masing-masing** (localStorage + IndexedDB), bukan di server. File lagu lokal ga pernah diupload ke mana-mana.
- Selector animasi dashboard pakai `a[href^="/server/"]:has(.status-bar)` biar ga kena link file manager (itu bug lama, udah dibenerin).

## Lisensi

MIT — pakai, modifikasi, sebar bebas. Attribution dihargai 🤙
