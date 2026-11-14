#!/usr/bin/env bash
# ============================================================
#  Pterodactyl Theme Pack installer
#  (c) alfa-marketdua-officialss — dark glass theme + dynamic
#  island + dotted globe login + live stats bars + orb musik
#
#  Cara pakai (jalankan sebagai root di server panel):
#     ./install.sh
#  Atau tentukan folder panel lain:
#     PANEL_DIR=/var/www/panel ./install.sh
#
#  Skip backend musik (tema CSS/JS aja):
#     SKIP_MUSIC=1 ./install.sh
#  Skip leaderboard:
#     SKIP_LEADERBOARD=1 ./install.sh
#  Skip widget dashboard:
#     SKIP_WIDGETS=1 ./install.sh
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR — jalanin dengan PANEL_DIR=/folder/panel"; exit 1; }

echo "[*] Panel : $PANEL_DIR"
echo "[*] Theme : $REPO_DIR"

# 1. assets
echo "[1/8] Copy assets (css/js)..."
for f in custom-auth-3d.css custom-auth-3d.js custom-island.css custom-island.js custom-stats.js custom-anim.css custom-orb.css custom-orb.js custom-shop-bot.jpg custom-chat.css custom-chat.js custom-leaderboard.css custom-leaderboard.js custom-widgets.css custom-widgets.js; do
  cp "$REPO_DIR/assets/$f" "$PANEL_DIR/public/assets/$f"
done

# 2. blade templates (backup yang lama duluan)
echo "[2/8] Deploy blade templates..."
BASE="$PANEL_DIR/resources/views/templates/base/core.blade.php"
AUTH="$PANEL_DIR/resources/views/templates/auth/core.blade.php"
[ -f "$BASE.bak-theme" ] || cp "$BASE" "$BASE.bak-theme"
[ -f "$AUTH.bak-theme" ] || cp "$AUTH" "$AUTH.bak-theme"
cp "$REPO_DIR/templates/base-core.blade.php" "$BASE"
cp "$REPO_DIR/templates/auth-core.blade.php" "$AUTH"

# 3. orb di halaman admin (patch idempotent, ga nimpa layout)
if [ -x "$REPO_DIR/admin-patch.sh" ]; then
  echo "[3/8] Patch orb untuk halaman /admin..."
  "$REPO_DIR/admin-patch.sh" || echo "[!] Patch admin gagal, lanjut (orb tetap jalan di halaman user)"
else
  echo "[3/8] admin-patch.sh ga ada, skip"
fi

# 4. backend musik per akun (controller + route + storage privat)
if [ "${SKIP_MUSIC:-0}" = "1" ]; then
  echo "[4/8] SKIP_MUSIC=1 — backend musik dilewati"
elif [ -x "$REPO_DIR/music-install.sh" ]; then
  echo "[4/8] Pasang backend orb musik per akun..."
  "$REPO_DIR/music-install.sh"
else
  echo "[4/8] music-install.sh ga ada, skip"
fi

# 5. leaderboard resource server (collector + route + cron)
if [ "${SKIP_LEADERBOARD:-0}" = "1" ]; then
  echo "[5/8] SKIP_LEADERBOARD=1 — leaderboard dilewati"
elif [ -x "$REPO_DIR/leaderboard-install.sh" ]; then
  echo "[5/8] Pasang leaderboard resource server..."
  "$REPO_DIR/leaderboard-install.sh"
else
  echo "[5/8] leaderboard-install.sh ga ada, skip"
fi

# 6. widget dashboard (status jaringan, server saya, kuota, node health)
if [ "${SKIP_WIDGETS:-0}" = "1" ]; then
  echo "[6/8] SKIP_WIDGETS=1 — widget dashboard dilewati"
elif [ -x "$REPO_DIR/widgets-install.sh" ]; then
  echo "[6/8] Pasang widget dashboard..."
  "$REPO_DIR/widgets-install.sh"
else
  echo "[6/8] widgets-install.sh ga ada, skip"
fi

# 7. clear cache view
echo "[7/8] Clear view cache..."
sudo -u www-data php "$PANEL_DIR/artisan" view:clear 2>/dev/null \
  || php "$PANEL_DIR/artisan" view:clear 2>/dev/null \
  || sudo -u www-data php "$PANEL_DIR/artisan" view:clear --no-interaction

# 7. permissions
echo "[8/8] Fix permissions..."
WEBUSER="www-data"
id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"
chown -R "$WEBUSER:$WEBUSER" "$PANEL_DIR/resources/views" "$PANEL_DIR/storage" "$PANEL_DIR/bootstrap/cache" "$PANEL_DIR/public/assets" 2>/dev/null || true

echo ""
echo "[✓] Selesai! Hard refresh browser (Ctrl+Shift+R) atau Incognito."
echo "    Login: globe titik 3D + efek sentuh"
echo "    Panel: dynamic island (jam+cuaca), tema glass, animasi list"
echo "    Orb: pojok kanan bawah, muncul juga di /admin"
echo "    Musik: playlist per akun, file privat di storage/app/music"
echo "    Chat Room (opsional): sudo ./chat-install.sh
    Widget dashboard: otomatis (pengumuman di /admin -> Widget & Pengumuman)"
echo "    Uninstall: ./uninstall.sh"
