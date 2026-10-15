#!/usr/bin/env bash
# ============================================================
#  Pterodactyl Theme Pack installer
#  (c) alfa-marketdua-officialss — dark glass theme + dynamic
#  island + dotted globe login + live stats bars
#
#  Cara pakai (jalankan sebagai root di server panel):
#     ./install.sh
#  Atau tentukan folder panel lain:
#     PANEL_DIR=/var/www/panel ./install.sh
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR — jalanin dengan PANEL_DIR=/folder/panel"; exit 1; }

echo "[*] Panel : $PANEL_DIR"
echo "[*] Theme : $REPO_DIR"

# 1. assets
echo "[1/4] Copy assets (css/js)..."
for f in custom-auth-3d.css custom-auth-3d.js custom-island.css custom-island.js custom-stats.js custom-anim.css; do
  cp "$REPO_DIR/assets/$f" "$PANEL_DIR/public/assets/$f"
done

# 2. blade templates (backup yang lama duluan)
echo "[2/4] Deploy blade templates..."
BASE="$PANEL_DIR/resources/views/templates/base/core.blade.php"
AUTH="$PANEL_DIR/resources/views/templates/auth/core.blade.php"
[ -f "$BASE.bak-theme" ] || cp "$BASE" "$BASE.bak-theme"
[ -f "$AUTH.bak-theme" ] || cp "$AUTH" "$AUTH.bak-theme"
cp "$REPO_DIR/templates/base-core.blade.php" "$BASE"
cp "$REPO_DIR/templates/auth-core.blade.php" "$AUTH"

# 3. clear cache view
echo "[3/4] Clear view cache..."
sudo -u www-data php "$PANEL_DIR/artisan" view:clear 2>/dev/null \
  || php "$PANEL_DIR/artisan" view:clear 2>/dev/null \
  || sudo -u www-data php "$PANEL_DIR/artisan" view:clear --no-interaction

# 4. permissions
echo "[4/4] Fix permissions..."
WEBUSER="www-data"
[ -d /usr/share/nginx ] && WEBUSER="nginx"
chown -R "$WEBUSER:$WEBUSER" "$PANEL_DIR/resources/views" "$PANEL_DIR/storage" "$PANEL_DIR/bootstrap/cache" "$PANEL_DIR/public/assets" 2>/dev/null || true

echo ""
echo "[✓] Selesai! Hard refresh browser (Ctrl+Shift+R) atau Incognito."
echo "    Login: globe titik 3D + efek sentuh"
echo "    Panel: dynamic island (jam+cuaca), tema glass, animasi list"
echo "    Uninstall: ./uninstall.sh"
