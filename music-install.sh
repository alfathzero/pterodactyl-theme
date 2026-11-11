#!/usr/bin/env bash
# ============================================================
#  Music Orb installer — playlist musik per akun
#  (pterodactyl-theme)
#
#  Jalankan SETELAH ./install.sh :
#     sudo ./music-install.sh
#  Panel di folder lain:
#     sudo PANEL_DIR=/var/www/panel ./music-install.sh
#
#  NB: installer ini nyentuh app code panel (controller + route)
#  dan bikin folder privat storage/app/music. Habis upgrade panel,
#  jalankan ulang file ini biar route musik balik.
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR — jalanin dengan PANEL_DIR=/folder/panel"; exit 1; }
[ -f "$REPO_DIR/music/routes/music.php" ] || { echo "[!] Folder music/ ga ada — git pull dulu."; exit 1; }

echo "[*] Panel : $PANEL_DIR"
echo "[*] Theme : $REPO_DIR"

BASE="$PANEL_DIR/routes/base.php"
CTRL_DIR="$PANEL_DIR/app/Http/Controllers/Music"
PRIV="$PANEL_DIR/storage/app/music"

# 1. backup route asli dulu
if [ ! -f "$BASE.bak-music" ]; then
  cp "$BASE" "$BASE.bak-music"
  echo "[1/6] Backup routes/base.php -> base.php.bak-music"
else
  echo "[1/6] Backup route udah ada, lanjut"
fi

# 2. copy controller + route
echo "[2/6] Copy controller & route musik..."
mkdir -p "$CTRL_DIR" "$PANEL_DIR/routes"
cp "$REPO_DIR/music/app/Http/Controllers/Music/MusicUploadController.php" "$CTRL_DIR/"
cp "$REPO_DIR/music/routes/music.php" "$PANEL_DIR/routes/"

# 3. sisipin require music.php SEBELUM catch-all SPA di routes/base.php
python3 - "$BASE" <<'PYEOF'
import re, sys
base = sys.argv[1]
src = open(base).read()
if "MUSIC-ORB START" in src or "require __DIR__ . '/music.php'" in src:
    print("[3/6] require music.php udah ada di routes/base.php")
else:
    # buang route musik inline versi lama (biar nggak dobel)
    src, n = re.subn(
        r"// Orb musik:.*?\nRoute::prefix\('/music'\)->group\(function \(\) \{.*?\n\}\);\n?",
        "", src, flags=re.S)
    if n:
        print("[3/6] Route musik inline lama dihapus")
    block = ("/* MUSIC-ORB START — custom orb musik per akun (pterodactyl-theme) */\n"
             "require __DIR__ . '/music.php';\n"
             "/* MUSIC-ORB END */\n\n")
    target = "Route::get('/{react}'"
    i = src.find(target)
    if i == -1:
        i = src.find("Route::")
    if i == -1:
        sys.exit("[!] Ga nemu 'Route::' di base.php — sisipin manual: require __DIR__.'/music.php'; sebelum catch-all")
    open(base, "w").write(src[:i] + block + src[i:])
    print("[3/6] require music.php disisipin ke routes/base.php")
PYEOF

# 4. folder privat + playlist kosong
echo "[4/6] Siapkan storage/app/music (privat)..."
mkdir -p "$PRIV"
[ -f "$PRIV/playlist.json" ] || printf '[]\n' > "$PRIV/playlist.json"
chmod 755 "$PRIV"
chmod 644 "$PRIV/playlist.json"

# 5. migrasi playlist publik lama (kalau ada) ke privat
if [ -f "$PANEL_DIR/public/music/playlist.json" ]; then
  python3 - "$PANEL_DIR/public/music" "$PRIV" <<'PYEOF'
import json, os, shutil, sys
pub, priv = sys.argv[1], sys.argv[2]
src = os.path.join(pub, 'playlist.json')
dst = os.path.join(priv, 'playlist.json')
try:
    old = json.load(open(src))
except Exception:
    old = []
try:
    cur = json.load(open(dst))
except Exception:
    cur = []
if old and not cur:
    items, moved = [], 0
    for x in old:
        f = x.get('file')
        if not f:
            continue
        s, d = os.path.join(pub, f), os.path.join(priv, f)
        if os.path.isfile(s) and not os.path.exists(d):
            shutil.move(s, d)
            moved += 1
        items.append({'title': x.get('title') or f, 'file': f, 'owner_id': 0})
    json.dump(items, open(dst, 'w'), ensure_ascii=False, indent=2)
    print(f"[5/6] Migrasi {len(items)} lagu lama -> privat (owner_id 0 / tersembunyi, {moved} file dipindah)")
    try:
        os.unlink(src)
    except OSError:
        pass
else:
    print("[5/6] Playlist privat udah ada, skip migrasi")
PYEOF
else
  echo "[5/6] Ga ada playlist publik lama, skip migrasi"
fi

# 6. clear cache + permission
echo "[6/6] Clear cache + permission..."
WEBUSER="www-data"
[ -d /usr/share/nginx ] && WEBUSER="nginx"
chown -R "$WEBUSER:$WEBUSER" "$PANEL_DIR/app/Http/Controllers/Music" "$PANEL_DIR/routes" "$PRIV" 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" route:clear 2>/dev/null || php "$PANEL_DIR/artisan" route:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" config:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true

echo ""
echo "[✓] Orb musik per akun aktif!"
echo "    - Playlist tiap akun terpisah, file privat di storage/app/music"
echo "    - Kuota: 25 lagu / 300 MB per akun"
echo "    - Hapus file lama permanen: sudo ./music-uninstall.sh --purge-files"
echo "    Uninstall backend: sudo ./music-uninstall.sh"
