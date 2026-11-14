#!/usr/bin/env bash
# cabut widget dashboard (pterodactyl-theme)
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

BASE="$PANEL_DIR/routes/base.php"
ADMIN_ROUTES="$PANEL_DIR/routes/admin.php"
ADMIN_LAYOUT="$PANEL_DIR/resources/views/layouts/admin.blade.php"
TPL="$PANEL_DIR/resources/views/templates/base/core.blade.php"

# 1. hapus file backend + view + asset
rm -f "$PANEL_DIR/app/Http/Controllers/WidgetController.php" \
      "$PANEL_DIR/app/Http/Controllers/Admin/WidgetController.php" \
      "$PANEL_DIR/routes/widgets.php" \
      "$PANEL_DIR/public/assets/custom-widgets.css" \
      "$PANEL_DIR/public/assets/custom-widgets.js"
rm -rf "$PANEL_DIR/resources/views/admin/widgets"

# 2. cabut require + route admin + menu sidebar + tag asset
python3 - "$BASE" "$ADMIN_ROUTES" "$ADMIN_LAYOUT" "$TPL" <<'PYEOF'
import re, sys
base, admin_routes, admin_layout, tpl = sys.argv[1:5]

def strip_block(path, start, end):
    try:
        src = open(path).read()
    except OSError:
        return
    new = re.sub(re.escape(start) + r".*?" + re.escape(end) + r"\s*", "", src, flags=re.S)
    if new != src:
        open(path, "w").write(new)

strip_block(base, "/* WIDGETS START", "/* WIDGETS END */")
strip_block(admin_routes, "/* WIDGETS START", "/* WIDGETS END */")

try:
    src = open(admin_layout).read()
    new = re.sub(r"\s*<li[^>]*>\s*(?:<a href=\"\{\{ route\('admin\.widgets'\) \}\}\">|@if \(\$isMainAdmin\)\s*<a href=\"\{\{ route\('admin\.widgets'\) \}\}\">).*?</li>", "", src, flags=re.S)
    if new != src:
        open(admin_layout, "w").write(new)
except OSError:
    pass

try:
    src = open(tpl).read()
    new = re.sub(r"\s*<link rel=\"stylesheet\" href=\"/assets/custom-widgets\.css\?v=\d+\">", "", src)
    new = re.sub(r"\s*<script src=\"/assets/custom-widgets\.js\?v=\d+\"></script>", "", new)
    if new != src:
        open(tpl, "w").write(new)
except OSError:
    pass
PYEOF

php "$PANEL_DIR/artisan" route:clear >/dev/null 2>&1 || true
php "$PANEL_DIR/artisan" view:clear >/dev/null 2>&1 || true
WEBUSER="www-data"
id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"
chown -R "$WEBUSER:$WEBUSER" "$PANEL_DIR/routes" "$PANEL_DIR/resources/views" "$PANEL_DIR/public/assets" 2>/dev/null || true

echo "[✓] Widget dashboard dicabut."
echo "    Pengumuman tetap ada di $PANEL_DIR/storage/app/announcement.json"
echo "    Hapus: rm -f $PANEL_DIR/storage/app/announcement.json $PANEL_DIR/storage/app/leaderboard-history.json"
