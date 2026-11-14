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
| 🧩 Widget Dashboard | 4 kartu glass di atas daftar server: **🌐 Status Jaringan** (total/online/offline + sparkline 60 menit), **🖥️ Server Saya** (status online + klik ke console), **📊 Kuota Resource** (RAM/disk terpakai, "Unlimited" kalau limit 0), **🛰️ Node Health** (status Wings live + jumlah server). Plus **banner pengumuman/promo** yang bisa diatur dari `/admin` → Widget & Pengumuman |
| 🏆 Leaderboard | Ikon trophy di navbar dashboard → modal **Top 10/20 server** berdasarkan pemakaian **CPU / RAM / Disk** live. Global semua server panel, server offline disembunyikan, auto-refresh 10 detik. Data dikumpulkan background tiap menit lewat `leaderboard:collect` |
| 🎧 Orb Menu | Satu orb melayang pojok kanan bawah (tap → mekar 4 bola): **💬 Chat Room**, **🛍️ Shop Bot** (`@Auto_Order_By_Alfa_bot`, ikon pakai foto profil bot), **✈️ Developer Telegram** (link + nama dev), **🎵 Musik**. Orb muncul di semua halaman panel **termasuk `/admin`**. Player musik: play/pause, stop, next/prev, bar progress bisa di-seek. **Playlist per akun** (bukan global): tiap akun cuma lihat lagu yang dia upload sendiri, tetap sinkron lintas device. Upload/hapus dari orb, file privat di `storage/app/music`, kuota 25 lagu / 300 MB per akun |
| 💬 Chat Room | Chat global pake identitas akun. **Semua user login bisa kirim pesan** (maks 2000 karakter, rate limit 40/menit). Admin bisa hapus pesan & mute user (username + avatar + badge ADMIN). Polling 2.5 detik, emoji reaksi (6), **@mention** autocomplete, hapus pesan (diri/admin), **mute user** (10m/1j/24j, admin only), online count, anti-spam & rate-limit, XSS-safe. **Notifikasi browser** (tab background) + suara + badge unread. **Auto-prune: pesan >24 jam kehapus otomatis** (cron, bisa diatur `--hours=`). Butuh `chat-install.sh` (nyentuh app code + DB) |
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
[1/8] Copy assets (css/js)...
[2/8] Deploy blade templates...
[3/8] Patch orb untuk halaman /admin...
[4/8] Pasang backend orb musik per akun...
[5/8] Pasang leaderboard resource server...
[6/8] Pasang widget dashboard...
[7/8] Clear view cache...
[8/8] Fix permissions...
[✓] Selesai!
```

> Musik otomatis terpasang (controller + route + `storage/app/music`). Leaderboard juga otomatis (collector + cron tiap menit). Widget dashboard juga otomatis (4 kartu + halaman pengumuman di `/admin`). Kalau cuma mau CSS/JS tanpa backend: `sudo SKIP_MUSIC=1 SKIP_LEADERBOARD=1 SKIP_WIDGETS=1 ./install.sh`.

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

> ℹ️ Orb musik dan leaderboard sudah otomatis aktif dari `install.sh` (musik per akun, leaderboard global top 20).
> ℹ️ Chat Room bisa dipakai semua user login buat kirim pesan. Admin panel punya akses tambahan: hapus pesan siapa aja dan mute user (10m/1j/24j).
> ⚠️ Chat beda sama tema — dia nyentuh **app code panel** (controller/model/migration/route) + bikin 3 tabel DB (`chat_*`). Kalau ga mau, skip aja, tema tetap jalan normal (tombol chat di orb cuma diem).

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
| Dashboard | 4 widget glass di atas daftar server (Status Jaringan, Server Saya, Kuota, Node Health) + daftar server glass |
| Navbar dashboard | Ikon 🏆 leaderboard → Top 10/20 CPU/RAM/Disk live |
| Halaman server | Bar progress warna-warni di stats |
| Pojok kanan bawah | Orb menu (tap → Chat Room 💬 / Shop Bot 🛍️ / Telegram ✈️ / Musik 🎵) |
| `/admin` | Orb juga muncul + menu **Widget & Pengumuman** buat atur banner dashboard |
| Orb → Musik | Upload lagu baru → muncul di playlist akun; hapus → hilang permanen setelah refresh |

---

## 🔄 Update tema ke versi terbaru

```bash
cd pterodactyl-theme
git pull
sudo ./install.sh          # tema + musik + leaderboard + widget + orb admin
sudo ./chat-install.sh     # kalau pakai Chat Room
```

> `chat-install.sh`, `music-install.sh`, `leaderboard-install.sh`, dan `widgets-install.sh` idempotent — aman dijalankan ulang, dan WAJIB dijalankan lagi **setelah upgrade panel** (upgrade panel nimpa `routes/base.php`, bikin route chat/musik/leaderboard ilang → 404). `install.sh` sudah otomatis memanggil music + leaderboard + widget; kalau mau ulang backend tertentu: `sudo ./music-install.sh` / `sudo ./leaderboard-install.sh` / `sudo ./widgets-install.sh`.

Lalu hard refresh browser lagi (file tema selalu naik versi `?v=`-nya).

## 🗑 Uninstall (balik default)

```bash
cd pterodactyl-theme
sudo ./chat-uninstall.sh   # hapus Chat Room dulu (opsional)
sudo ./uninstall.sh        # tema + musik + leaderboard + widget + patch admin
```

Template asli (yang ke-backup `*.bak-theme` pas install) dibalikin, file tema dihapus. `chat-uninstall.sh` restore `routes/base.php`, buang file backend chat, & (kalau lu mau) drop tabel `chat_*`. File musik **tetap disimpan** — hapus permanen dengan:

```bash
sudo ./music-uninstall.sh --purge-files
```

Cache leaderboard juga tetap disimpan; hapus dengan `sudo ./leaderboard-uninstall.sh --purge-data`.

Pengumuman dashboard juga tetap disimpan di `storage/app/announcement.json`. Hapus manual kalau mau bersih total.

## 🛠 Troubleshooting

| Masalah | Solusi |
|---|---|
| `[!] Panel ga ketemu` | Jalanin pakai `PANEL_DIR=/lokasi/panel sudo -E ./install.sh` |
| Tema muncul separo / lama | Cache view: `sudo -u www-data php artisan view:clear` + purge cache browser/Cloudflare |
| Island ga muncul | Pastiin lu login sebagai user (halaman panel), bukan halaman admin lama; hard refresh |
| Cuaca island ga muncul | HP ga bisa akses `api.open-meteo.com`? Cek koneksi/adblock |
| Orb player ga mau muter lagu | Format harus mp3/m4a/ogg/wav/flac/aac dan ukuran maks 64 MB per file |
| Musik 401 / minta login | Orb musik butuh login. Refresh halaman setelah login |
| Musik 403 / "bukan milik akun" | Playlist memang per akun — lagu itu milik akun lain. Login yang benar |
| Musik 419 / upload-hapus gagal | Sesi/token expired. Hard refresh, login ulang, coba lagi |
| Hapus lagu balik lagi setelah refresh | Pastikan orb v11+ (hard refresh). Versi lama hapus tanpa nunggu server |
| Orb ga muncul di `/admin` | `sudo ./admin-patch.sh` lalu `php artisan view:clear` |
| Chat Room 404 / tombol chat diem | Habis upgrade panel? `sudo ./chat-install.sh` lagi (route-nya ke-timpa). Kalau tombol diem doang: `chat-install.sh` belum pernah dijalankan |
| Musik 404 setelah upgrade panel | `sudo ./music-install.sh` lagi (route musik ke-timpa upgrade) |
| Leaderboard kosong / "data lama" | Cron collector belum jalan. Tes manual: `sudo -u www-data php artisan leaderboard:collect` |
| Leaderboard 404 setelah upgrade panel | `sudo ./leaderboard-install.sh` lagi (route + cron ke-timpa upgrade) |
| Widget dashboard ga muncul | `sudo ./widgets-install.sh` lagi habis upgrade panel, lalu hard refresh. Cek endpoint: `/widgets/data` harus balikin JSON |
| Widget "Nunggu history collector" | Collector belum jalan 2x. Tunggu 1–2 menit atau tes `sudo -u www-data php artisan leaderboard:collect` |
| Node Health Wings offline | Cek `https://<fqdn>:<port>/api/system` pakai token node; firewall/port Wings sering jadi penyebab |
| Banner pengumuman ga muncul | Pastiin checkbox **Tampilkan di dashboard** dicentang dan tanggal berakhir belum lewat |
| Ikon trophy ga muncul | Hard refresh; pastikan `custom-leaderboard.js?v=1` ke-load dan layout base tema masih aktif |
| Chat ga mau kirim (429) | Rate limit: 40 pesan/menit atau kedetect spam — tunggu sebentar |
| Chat gagal kirim pesan panjang | Maksimal **2000 karakter**. Pesan >2000 ditolak server (sekarang alasannya muncul di toast) |
| Chat error 419 / "Sesi kedaluwarsa" | Token sesi expired (halaman kebuka kelamaan) — refresh halaman lalu kirim lagi |
| Habis upgrade panel tema ilang | Wajar, blade ke-overwrite. Tinggal `git pull && sudo ./install.sh && sudo ./chat-install.sh` lagi |

## Struktur

```
assets/        custom-auth-3d.css|js   -> public/assets/ (login)
               custom-island.css|js    -> public/assets/ (island)
               custom-stats.js         -> public/assets/ (bar progress console)
               custom-orb.css|js       -> public/assets/ (orb menu: chat/shop/tg/musik + player)
               custom-shop-bot.jpg     -> public/assets/ (logo orb Shop Bot)
               custom-chat.css|js      -> public/assets/ (window chat)
               custom-widgets.css|js   -> public/assets/ (widget dashboard + banner)
               custom-anim.css         -> public/assets/ (tema + animasi global)
chat/          app/ + database/ + routes/  -> app code panel (ChatController, models, migration, route, prune command)
               sw-notify.js            -> public/sw-notify.js (service worker notifikasi chat)
music/         app/Http/Controllers/Music/MusicUploadController.php -> app code panel (playlist per akun + stream privat)
               routes/music.php        -> routes/music.php (route playlist/upload/stream/hapus)
leaderboard/   app/Http/Controllers/LeaderboardController.php -> endpoint top 10/20
               app/Console/Commands/CollectLeaderboardCommand.php -> collector resource Wings
               routes/leaderboard.php  -> routes/leaderboard.php (route /leaderboard/servers)
widgets/       app/Http/Controllers/WidgetController.php -> endpoint /widgets/data (1 request, cache 60s)
               app/Http/Controllers/Admin/WidgetController.php -> simpan pengumuman dashboard
               resources/views/admin/widgets/index.blade.php -> form pengumuman di /admin
               routes/widgets.php      -> routes/widgets.php (route /widgets/data)
templates/     base-core.blade.php     -> resources/views/templates/base/core.blade.php
               auth-core.blade.php     -> resources/views/templates/auth/core.blade.php
install.sh            installer tema (assets + template + patch admin + musik + leaderboard + widget)
admin-patch.sh        pasang/cabut orb di layout admin (`--remove`), aman buat upgrade
music-install.sh      installer backend musik per akun (controller + route + storage privat)
music-uninstall.sh    cabut backend musik (file lagu tetap; `--purge-files` hapus permanen)
leaderboard-install.sh   installer leaderboard + collector + cron tiap menit
leaderboard-uninstall.sh cabut leaderboard + cron (`--purge-data` hapus cache)
widgets-install.sh    installer widget dashboard + halaman pengumuman (idempotent)
widgets-uninstall.sh  cabut widget dashboard (pengumuman tetap disimpan)
chat-install.sh       installer Chat Room (app code + DB, idempotent; jalankan lagi habis upgrade panel)
chat-uninstall.sh     buang Chat Room (restore route, hapus file, opsional drop tabel)
uninstall.sh          restore tema dari backup
```

## Catatan

- `templates/base-core.blade.php` mengandung blok **SANO NEON** (toast "Selamat Pagi/Siang/Malam, Hai <user> 👋" neon) di dalam `@section('container')`. Mau buang? Hapus bagian di antara `{{-- START: SANO NEON --}}` sampai `{{-- END: SANO NEON --}}`.
- Cuaca island pakai [Open-Meteo](https://open-meteo.com) (gratis, tanpa API key). Koordinat Bekasi Selatan ada di `assets/custom-island.js` (`WX_URL`, lat `-6.27` lon `106.99`) — ganti buat kota lain.
- Playlist musik sekarang **per akun dan disimpan di server** (`storage/app/music/playlist.json`). File lagu privat, hanya bisa di-stream lewat `/music/stream/{file}` setelah login dan hanya oleh pemiliknya (admin utama boleh moderasi). Kuota 25 lagu / 300 MB per akun.
- File lagu lama dari versi publik otomatis dimigrasi ke storage privat dengan `owner_id: 0` (tersembunyi). Untuk mengklaim/menghapusnya, edit `playlist.json` atau jalankan `music-uninstall.sh --purge-files`.
- Link Shop Bot ada di `assets/custom-orb.js` (`SHOP_URL`) dan ikonnya `assets/custom-shop-bot.jpg`. Ganti link/logo tinggal edit dua file itu.
- Widget dashboard ambil data dari satu endpoint `/widgets/data` (cache global 60 detik). Status online ikut cache `leaderboard.json`; history sparkline di `storage/app/leaderboard-history.json` (60 titik terakhir, ditulis collector tiap menit). Pengumuman disimpan di `storage/app/announcement.json` dan diedit dari `/admin` → **Widget & Pengumuman**.
- Leaderboard server disimpan di `storage/app/leaderboard.json`, dikumpulkan cron `leaderboard:collect` tiap menit (request paralel ke Wings). Frontend cuma baca cache + auto-refresh 10 detik. Server offline/stopped tidak masuk ranking. Skor tidak digabung — ranking langsung per tab CPU/RAM/Disk.
- Selector animasi dashboard pakai `a[href^="/server/"]:has(.status-bar)` biar ga kena link file manager (itu bug lama, udah dibenerin).

## Lisensi

MIT — pakai, modifikasi, sebar bebas. Attribution dihargai 🤙
