#!/usr/bin/env bash
# balikin template asli (backup dibuat install.sh)
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"

BASE="$PANEL_DIR/resources/views/templates/base/core.blade.php"
AUTH="$PANEL_DIR/resources/views/templates/auth/core.blade.php"

[ -f "$BASE.bak-theme" ] && cp "$BASE.bak-theme" "$BASE" && echo "[*] base restored"
[ -f "$AUTH.bak-theme" ] && cp "$AUTH.bak-theme" "$AUTH" && echo "[*] auth restored"

for f in custom-auth-3d.css custom-auth-3d.js custom-island.css custom-island.js custom-stats.js custom-anim.css; do
  rm -f "$PANEL_DIR/public/assets/$f"
done

php "$PANEL_DIR/artisan" view:clear >/dev/null 2>&1 || true
chown -R www-data:www-data "$PANEL_DIR/resources/views" "$PANEL_DIR/public/assets" 2>/dev/null || true
echo "[✓] Theme dihapus, panel balik default."
