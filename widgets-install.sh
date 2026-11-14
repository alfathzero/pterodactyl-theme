#!/usr/bin/env bash
# ============================================================
#  Widget installer — status jaringan, server saya, kuota,
#  node health + banner pengumuman (pterodactyl-theme)
#
#  Jalankan SETELAH ./install.sh :
#     sudo ./widgets-install.sh
#  Panel di folder lain:
#     sudo PANEL_DIR=/var/www/panel ./widgets-install.sh
#
#  Butuh: controller + route + view admin + asset + cache leaderboard.
#  Habis upgrade panel, jalankan ulang file ini.
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR — jalanin dengan PANEL_DIR=/folder/panel"; exit 1; }
[ -f "$REPO_DIR/widgets/routes/widgets.php" ] || { echo "[!] Folder widgets/ ga ada — git pull dulu."; exit 1; }

echo "[*] Panel : $PANEL_DIR"
echo "[*] Theme : $REPO_DIR"

BASE="$PANEL_DIR/routes/base.php"
ADMIN_ROUTES="$PANEL_DIR/routes/admin.php"
ADMIN_LAYOUT="$PANEL_DIR/resources/views/layouts/admin.blade.php"
TPL="$PANEL_DIR/resources/views/templates/base/core.blade.php"
WEBUSER="www-data"
id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"

# 1. copy backend + view + asset
mkdir -p "$PANEL_DIR/app/Http/Controllers/Admin" \
  "$PANEL_DIR/routes" \
  "$PANEL_DIR/resources/views/admin/widgets" \
  "$PANEL_DIR/public/assets" \
  "$PANEL_DIR/storage/app"

cp "$REPO_DIR/widgets/app/Http/Controllers/WidgetController.php" "$PANEL_DIR/app/Http/Controllers/"
cp "$REPO_DIR/widgets/app/Http/Controllers/Admin/WidgetController.php" "$PANEL_DIR/app/Http/Controllers/Admin/"
cp "$REPO_DIR/widgets/routes/widgets.php" "$PANEL_DIR/routes/"
cp "$REPO_DIR/widgets/resources/views/admin/widgets/index.blade.php" "$PANEL_DIR/resources/views/admin/widgets/"
cp "$REPO_DIR/assets/custom-widgets.css" "$REPO_DIR/assets/custom-widgets.js" "$PANEL_DIR/public/assets/"
# service worker notifikasi dipakai bareng chat + pengumuman
if [ -f "$REPO_DIR/chat/sw-notify.js" ]; then
  cp "$REPO_DIR/chat/sw-notify.js" "$PANEL_DIR/public/sw-notify.js"
fi
echo "[1/6] Controller, route, view admin, asset + service worker dicopy"

# 2. require widgets.php di base.php (sebelum catch-all SPA)
python3 - "$BASE" <<'PYEOF'
import sys
base = sys.argv[1]
src = open(base).read()
if "WIDGETS START" in src or "require __DIR__ . '/widgets.php'" in src:
    print("[2/6] require widgets.php udah ada")
else:
    block = ("/* WIDGETS START — widget dashboard (pterodactyl-theme) */\n"
             "require __DIR__ . '/widgets.php';\n"
             "/* WIDGETS END */\n\n")
    i = src.find("Route::get('/{react}'")
    if i == -1:
        i = src.find("Route::")
    if i == -1:
        sys.exit("[!] Ga nemu 'Route::' di base.php")
    open(base, "w").write(src[:i] + block + src[i:])
    print("[2/6] require widgets.php disisipin")
PYEOF

# 3. route admin /admin/widgets
python3 - "$ADMIN_ROUTES" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
if "admin.widgets" in src:
    print("[3/6] route admin widgets udah ada")
else:
    anchor = "Route::get('/', [Admin\\BaseController::class, 'index'])->name('admin.index');"
    if anchor not in src:
        sys.exit("[!] Ga nemu route admin.index di admin.php")
    block = anchor + """

/* WIDGETS START — pengumuman dashboard (pterodactyl-theme) */
Route::group(['prefix' => 'widgets'], function () {
    Route::get('/', [Admin\\WidgetController::class, 'index'])->name('admin.widgets');
    Route::post('/', [Admin\\WidgetController::class, 'update'])->name('admin.widgets.update');
});
/* WIDGETS END */"""
    open(p, "w").write(src.replace(anchor, block, 1))
    print("[3/6] route admin widgets disisipin")
PYEOF

# 4. menu sidebar admin
python3 - "$ADMIN_LAYOUT" <<'PYEOF'
import sys, re
p = sys.argv[1]
src = open(p).read()
if "admin.widgets" in src:
    print("[4/6] menu sidebar widgets udah ada")
else:
    m = re.search(r"<li[^>]*>\s*<a href=\"\{\{ route\('admin\.index'\) \}\}\">.*?</li>", src, re.S)
    if not m:
        sys.exit("[!] Ga nemu menu Overview di admin.blade.php")
    item = m.group(0) + """
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.widgets') ?: 'active' }}">
                            @if ($isMainAdmin)
                                <a href="{{ route('admin.widgets') }}">
                                    <i class="fa fa-bullhorn"></i> <span>Widget &amp; Pengumuman</span>
                                </a>
                            @else
                                <span class="menu-locked">
                                    <i class="fa fa-bullhorn"></i> <span>Widget &amp; Pengumuman</span>
                                    <i class="fa fa-lock menu-lock-icon"></i>
                                </span>
                            @endif
                        </li>"""
    open(p, "w").write(src[:m.start()] + item + src[m.end():])
    print("[4/6] menu sidebar widgets disisipin")
PYEOF

# 5. tag asset widget di layout utama (idempotent)
if [ -f "$TPL" ]; then
  python3 - "$TPL" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
changed = []
if "custom-widgets.css" not in src:
    for anchor in ('<link rel="stylesheet" href="/assets/custom-leaderboard.css?v=3">',
                   '<link rel="stylesheet" href="/assets/custom-chat.css?v=3">',
                   '<link rel="stylesheet" href="/assets/custom-orb.css?v=8">'):
        if anchor in src:
            src = src.replace(anchor, anchor + '\n    <link rel="stylesheet" href="/assets/custom-widgets.css?v=5">', 1)
            changed.append("CSS")
            break
if "custom-widgets.js" not in src:
    for anchor in ('<script src="/assets/custom-leaderboard.js?v=3"></script>',
                   '<script src="/assets/custom-chat.js?v=7"></script>',
                   '<script src="/assets/custom-orb.js?v=15"></script>'):
        if anchor in src:
            src = src.replace(anchor, anchor + '\n    <script src="/assets/custom-widgets.js?v=5"></script>', 1)
            changed.append("JS")
            break
if changed:
    open(p, "w").write(src)
    print("[5/6] Asset widget disisipin ke layout: " + ", ".join(changed))
else:
    print("[5/6] Asset widget sudah ada di layout")
PYEOF
fi

# 6. cache + permission
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" route:clear 2>/dev/null || php "$PANEL_DIR/artisan" route:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" config:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true
chown -R "$WEBUSER:$WEBUSER" \
  "$PANEL_DIR/app/Http/Controllers/WidgetController.php" \
  "$PANEL_DIR/app/Http/Controllers/Admin/WidgetController.php" \
  "$PANEL_DIR/routes/widgets.php" "$PANEL_DIR/routes/base.php" "$PANEL_DIR/routes/admin.php" \
  "$PANEL_DIR/resources/views/admin/widgets" "$PANEL_DIR/resources/views/layouts/admin.blade.php" \
  "$PANEL_DIR/public/assets/custom-widgets.css" "$PANEL_DIR/public/assets/custom-widgets.js" \
  "$PANEL_DIR/public/sw-notify.js" \
  "$PANEL_DIR/storage/app" 2>/dev/null || true
echo "[6/6] Cache dibersihkan + permission"

echo ""
echo "[✓] Widget dashboard aktif!"
echo "    4 widget: Status Jaringan, Server Saya, Kuota Resource, Node Health"
echo "    Pengumuman: /admin -> Widget & Pengumuman"
echo "    Status online ambil dari cache leaderboard:collect (tiap menit)"
echo "    Uninstall: sudo ./widgets-uninstall.sh"
