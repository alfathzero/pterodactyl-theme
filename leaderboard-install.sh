#!/usr/bin/env bash
# ============================================================
#  Leaderboard installer — top 20 resource server live
#  (pterodactyl-theme)
#
#  Jalankan SETELAH ./install.sh :
#     sudo ./leaderboard-install.sh
#  Panel di folder lain:
#     sudo PANEL_DIR=/var/www/panel ./leaderboard-install.sh
#
#  Butuh: route + controller + command + cron collector tiap menit.
#  Habis upgrade panel, jalankan ulang file ini.
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR — jalanin dengan PANEL_DIR=/folder/panel"; exit 1; }
[ -f "$REPO_DIR/leaderboard/routes/leaderboard.php" ] || { echo "[!] Folder leaderboard/ ga ada — git pull dulu."; exit 1; }

echo "[*] Panel : $PANEL_DIR"
echo "[*] Theme : $REPO_DIR"

BASE="$PANEL_DIR/routes/base.php"
WEBUSER="www-data"
id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"

# 1. backup route + copy backend + assets
[ -f "$BASE.bak-leaderboard" ] || cp "$BASE" "$BASE.bak-leaderboard"
mkdir -p "$PANEL_DIR/app/Http/Controllers" "$PANEL_DIR/app/Console/Commands" "$PANEL_DIR/routes" "$PANEL_DIR/storage/app" "$PANEL_DIR/public/assets"
cp "$REPO_DIR/leaderboard/app/Http/Controllers/LeaderboardController.php" "$PANEL_DIR/app/Http/Controllers/"
cp "$REPO_DIR/leaderboard/app/Console/Commands/CollectLeaderboardCommand.php" "$PANEL_DIR/app/Console/Commands/"
cp "$REPO_DIR/leaderboard/routes/leaderboard.php" "$PANEL_DIR/routes/"
cp "$REPO_DIR/assets/custom-leaderboard.css" "$REPO_DIR/assets/custom-leaderboard.js" "$PANEL_DIR/public/assets/"
echo "[1/5] Controller, command, route, asset dicopy"

# 1b. tag asset leaderboard di layout utama (idempotent)
TPL="$PANEL_DIR/resources/views/templates/base/core.blade.php"
if [ -f "$TPL" ]; then
  python3 - "$TPL" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
changed = []
if "custom-leaderboard.css" not in src:
    anchor = '<link rel="stylesheet" href="/assets/custom-chat.css?v=3">'
    if anchor in src:
        src = src.replace(anchor, anchor + '\n    <link rel="stylesheet" href="/assets/custom-leaderboard.css?v=3">', 1)
        changed.append("CSS")
if "custom-leaderboard.js" not in src:
    anchor = '<script src="/assets/custom-chat.js?v=3"></script>'
    if anchor in src:
        src = src.replace(anchor, anchor + '\n    <script src="/assets/custom-leaderboard.js?v=3"></script>', 1)
        changed.append("JS")
if changed:
    open(p, "w").write(src)
    print("[1b/5] Asset leaderboard disisipin ke layout: " + ", ".join(changed))
else:
    print("[1b/5] Asset leaderboard sudah ada di layout")
PYEOF
fi

# 2. sisipin require leaderboard.php sebelum catch-all SPA
python3 - "$BASE" <<'PYEOF'
import sys
base = sys.argv[1]
src = open(base).read()
if "LEADERBOARD START" in src or "require __DIR__ . '/leaderboard.php'" in src:
    print("[2/5] require leaderboard.php udah ada")
else:
    block = ("/* LEADERBOARD START — leaderboard resource server (pterodactyl-theme) */\n"
             "require __DIR__ . '/leaderboard.php';\n"
             "/* LEADERBOARD END */\n\n")
    i = src.find("Route::get('/{react}'")
    if i == -1:
        i = src.find("Route::")
    if i == -1:
        sys.exit("[!] Ga nemu 'Route::' di base.php")
    open(base, "w").write(src[:i] + block + src[i:])
    print("[2/5] require leaderboard.php disisipin")
PYEOF

# 3. clear cache + permission
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" route:clear 2>/dev/null || php "$PANEL_DIR/artisan" route:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" config:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true
chown -R "$WEBUSER:$WEBUSER" "$PANEL_DIR/app/Http/Controllers/LeaderboardController.php" \
  "$PANEL_DIR/app/Console/Commands/CollectLeaderboardCommand.php" \
  "$PANEL_DIR/routes/leaderboard.php" "$PANEL_DIR/routes/base.php" "$PANEL_DIR/storage/app" 2>/dev/null || true
echo "[3/5] Cache dibersihkan + permission"

# 4. collector pertama (biar leaderboard langsung ada isinya)
echo "[4/5] Ambil data resource pertama kali (bisa 5-30 detik)..."
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" leaderboard:collect --concurrency=20 2>&1 | tail -n 3 \
  || echo "[!] Collector gagal jalan, nanti cron yang coba lagi"

# 5. cron tiap menit
if [ "${LEADERBOARD_SKIP_CRON:-0}" = "1" ]; then
  echo "[5/5] LEADERBOARD_SKIP_CRON=1 — cron dilewati"
else
  CRON_TAG="pteroleaderboard (pterodactyl-theme)"
  CRON_LINE="* * * * * php $PANEL_DIR/artisan leaderboard:collect --concurrency=20 > /dev/null 2>&1"
  TMPCT="$(mktemp)"
  crontab -u "$WEBUSER" -l 2>/dev/null | grep -v -e 'pteroleaderboard' -e "$PANEL_DIR/artisan leaderboard:collect" > "$TMPCT" || true
  { cat "$TMPCT"; echo "# $CRON_TAG START"; echo "$CRON_LINE"; echo "# $CRON_TAG END"; } | crontab -u "$WEBUSER" -
  rm -f "$TMPCT"
  echo "[5/5] Cron collector tiap menit dipasang"
fi

WEBUSER="$WEBUSER" php -r 'exit(0);' 2>/dev/null || true
chown "$WEBUSER:$WEBUSER" "$PANEL_DIR/storage/app/leaderboard.json" 2>/dev/null || true

echo ""
echo "[✓] Leaderboard server aktif!"
echo "    Ikon 🏆 di navbar -> Top 10/20 (CPU / RAM / Disk)"
echo "    Data update tiap ~1 menit lewat cron leaderboard:collect"
echo "    Uninstall: sudo ./leaderboard-uninstall.sh"
