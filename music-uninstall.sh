#!/usr/bin/env bash
# ============================================================
#  Music Orb uninstaller (pterodactyl-theme)
#
#  Default: cabut backend musik (controller + route), FILE LAGU TETAP.
#  Hapus file lagu juga:
#     sudo ./music-uninstall.sh --purge-files
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
PURGE=0
[ "${1:-}" = "--purge-files" ] && PURGE=1

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR — pakai PANEL_DIR=/folder/panel"; exit 1; }

BASE="$PANEL_DIR/routes/base.php"

# 1. buang require music.php dari routes/base.php
if [ -f "$BASE" ]; then
  python3 - "$BASE" <<'PYEOF'
import re, sys
p = sys.argv[1]
src = open(p).read()
orig = src
src = re.sub(r"/\* MUSIC-ORB START.*?MUSIC-ORB END \*/\n?\n?", "", src, flags=re.S)
src = re.sub(r"^require __DIR__ \. '/music\.php';\n", "", src, flags=re.M)
if src != orig:
    open(p, "w").write(src)
    print("[1/4] Route musik dicabut dari routes/base.php")
else:
    print("[1/4] Route musik ga ketemu, lanjut")
PYEOF
fi

# 2. hapus controller + route
rm -f "$PANEL_DIR/app/Http/Controllers/Music/MusicUploadController.php"
rmdir "$PANEL_DIR/app/Http/Controllers/Music" 2>/dev/null || true
rm -f "$PANEL_DIR/routes/music.php"
echo "[2/4] Controller & route musik dihapus"

# 3. file lagu
if [ "$PURGE" = "1" ]; then
  rm -rf "$PANEL_DIR/storage/app/music"
  echo "[3/4] Semua file musik dihapus permanen"
else
  echo "[3/4] File musik DIPERTAHANKAN di $PANEL_DIR/storage/app/music"
  echo "       (hapus manual kalau udah ga perlu: rm -rf $PANEL_DIR/storage/app/music)"
fi

# 4. cache + permission
WEBUSER="www-data"
[ -d /usr/share/nginx ] && WEBUSER="nginx"
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" route:clear 2>/dev/null || php "$PANEL_DIR/artisan" route:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true
echo "[4/4] Cache dibersihkan"
echo "[✓] Backend orb musik dicabut."
