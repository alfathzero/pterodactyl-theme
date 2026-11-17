#!/usr/bin/env bash
# cabut profile photo (pterodactyl-theme)
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

BASE="$PANEL_DIR/routes/base.php"
TPL="$PANEL_DIR/resources/views/templates/base/core.blade.php"
WEBUSER="www-data"
id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"

# 1. hapus file backend + asset
rm -f "$PANEL_DIR/app/Http/Controllers/ProfileAvatarController.php" \
      "$PANEL_DIR/routes/profile.php" \
      "$PANEL_DIR/public/assets/custom-profile.css" \
      "$PANEL_DIR/public/assets/custom-profile.js"
rm -rf "$PANEL_DIR/storage/app/private/avatars"

# 2. cabut route dari base.php
python3 - "$BASE" <<'PYEOF'
import re, sys
p = sys.argv[1]
try:
    src = open(p).read()
except OSError:
    sys.exit(0)
new = re.sub(r"\n?/\* PROFILE-PHOTO START.*?PROFILE-PHOTO END \*/", "", src, flags=re.S)
if new != src:
    open(p, "w").write(new)
    print("[*] Route profile.php dicabut")
PYEOF

# 3. revert User model patch (hapus fillable + accessor)
python3 - "$PANEL_DIR/app/Models/User.php" <<'PYEOF'
import sys
p = sys.argv[1]
try:
    src = open(p).read()
except OSError:
    sys.exit(0)
changed = False
if "'avatar_path'," in src:
    src = src.replace("        'avatar_path',\n", "")
    changed = True
import re
new = re.sub(
    r"    /\*\*\n     \* URL foto profil.*?getAvatarUrlAttribute.*?\n    \}\n\n",
    "",
    src,
    flags=re.S,
)
if new != src:
    src = new
    changed = True
if changed:
    open(p, "w").write(src)
    print("[*] User model di-revert (fillable + accessor)")
PYEOF

# 4. hapus tag CSS/JS dari template + revert chat version
python3 - "$TPL" <<'PYEOF'
import re, sys
p = sys.argv[1]
try:
    src = open(p).read()
except OSError:
    sys.exit(0)
src = re.sub(r'\n    <link rel="stylesheet" href="/assets/custom-profile\.css\?v=\d+">', "", src)
src = re.sub(r'\n    <script src="/assets/custom-profile\.js\?v=\d+"></script>', "", src)
# remove data-user-id from app div
src = src.replace('<div id="app" data-user-id="{{ auth()->user()->id ?? 0 }}"></div>', '<div id="app"></div>')
src = src.replace("custom-chat.css?v=4", "custom-chat.css?v=3")
src = src.replace("custom-chat.js?v=8", "custom-chat.js?v=7")
open(p, "w").write(src)
print("[*] Template di-revert")
PYEOF

# 5. chown + clear cache
chown -R "$WEBUSER:$WEBUSER" \
  "$PANEL_DIR/app/Models/User.php" \
  "$PANEL_DIR/routes/base.php" \
  "$PANEL_DIR/resources/views" 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" route:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:cache 2>/dev/null || true

echo "[✓] Profile photo dicabut."
echo "    Catatan: kolom avatar_path di DB dibiarkan (rollback migration manual: php artisan migrate:rollback --step=1)"
