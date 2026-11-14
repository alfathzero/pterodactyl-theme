#!/usr/bin/env bash
# balikin template asli (backup dibuat install.sh)
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

BASE="$PANEL_DIR/resources/views/templates/base/core.blade.php"
AUTH="$PANEL_DIR/resources/views/templates/auth/core.blade.php"

# cabut widget dashboard (pengumuman tetap disimpan)
[ -x "$REPO_DIR/widgets-uninstall.sh" ] && "$REPO_DIR/widgets-uninstall.sh" || true
# cabut backend leaderboard (cache tetap disimpan)
[ -x "$REPO_DIR/leaderboard-uninstall.sh" ] && "$REPO_DIR/leaderboard-uninstall.sh" || true
# cabut backend musik + patch orb admin (file lagu tetap disimpan)
[ -x "$REPO_DIR/music-uninstall.sh" ] && "$REPO_DIR/music-uninstall.sh" || true
[ -x "$REPO_DIR/admin-patch.sh" ] && "$REPO_DIR/admin-patch.sh" --remove || true

[ -f "$BASE.bak-theme" ] && cp "$BASE.bak-theme" "$BASE" && echo "[*] base restored"
[ -f "$AUTH.bak-theme" ] && cp "$AUTH.bak-theme" "$AUTH" && echo "[*] auth restored"

for f in custom-auth-3d.css custom-auth-3d.js custom-island.css custom-island.js custom-stats.js custom-anim.css custom-orb.css custom-orb.js custom-shop-bot.jpg custom-chat.css custom-chat.js custom-leaderboard.css custom-leaderboard.js custom-widgets.css custom-widgets.js; do
  rm -f "$PANEL_DIR/public/assets/$f"
done
rm -f "$PANEL_DIR/public/sw-notify.js"

php "$PANEL_DIR/artisan" view:clear >/dev/null 2>&1 || true
chown -R www-data:www-data "$PANEL_DIR/resources/views" "$PANEL_DIR/public/assets" 2>/dev/null || true
echo "[✓] Theme dihapus, panel balik default."
echo "    File musik tetap ada di $PANEL_DIR/storage/app/music"
echo "    Hapus permanen: rm -rf $PANEL_DIR/storage/app/music"
