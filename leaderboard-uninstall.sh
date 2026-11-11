#!/usr/bin/env bash
# ============================================================
#  Leaderboard uninstaller (pterodactyl-theme)
#
#  Default: cabut backend leaderboard + cron, data cache tetap.
#  Hapus cache juga:
#     sudo ./leaderboard-uninstall.sh --purge-data
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
PURGE=0
[ "${1:-}" = "--purge-data" ] && PURGE=1

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR"; exit 1; }

BASE="$PANEL_DIR/routes/base.php"
WEBUSER="www-data"
id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"

if [ -f "$BASE" ]; then
  python3 - "$BASE" <<'PYEOF'
import re, sys
p = sys.argv[1]
src = open(p).read()
orig = src
src = re.sub(r"/\* LEADERBOARD START.*?LEADERBOARD END \*/\n?\n?", "", src, flags=re.S)
src = re.sub(r"^require __DIR__ \. '/leaderboard\.php';\n", "", src, flags=re.M)
if src != orig:
    open(p, "w").write(src)
    print("[1/4] Route leaderboard dicabut")
else:
    print("[1/4] Route leaderboard ga ketemu")
PYEOF
fi

rm -f "$PANEL_DIR/app/Http/Controllers/LeaderboardController.php"
rm -f "$PANEL_DIR/app/Console/Commands/CollectLeaderboardCommand.php"
rm -f "$PANEL_DIR/routes/leaderboard.php"
echo "[2/4] File backend leaderboard dihapus"

CRON_TAG="pteroleaderboard (pterodactyl-theme)"
TMPCT="$(mktemp)"
crontab -u "$WEBUSER" -l 2>/dev/null | grep -v -e 'pteroleaderboard' -e "$PANEL_DIR/artisan leaderboard:collect" > "$TMPCT" || true
crontab -u "$WEBUSER" "$TMPCT" 2>/dev/null || true
rm -f "$TMPCT"
echo "[3/4] Cron collector dicabut"

if [ "$PURGE" = "1" ]; then
  rm -f "$PANEL_DIR/storage/app/leaderboard.json"
  echo "[4/4] Cache leaderboard dihapus"
else
  echo "[4/4] Cache leaderboard dipertahankan di $PANEL_DIR/storage/app/leaderboard.json"
fi

sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" route:clear 2>/dev/null || php "$PANEL_DIR/artisan" route:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true
echo "[✓] Leaderboard dicabut."
