#!/usr/bin/env bash
# ============================================================
#  Profile photo installer — upload foto profil user + avatar
#  navbar/chat (pterodactyl-theme)
#
#  Jalankan SETELAH ./install.sh :
#     sudo ./profile-install.sh
#  Panel di folder lain:
#     sudo PANEL_DIR=/var/www/panel ./profile-install.sh
#
#  Butuh: GD extension (php-gd), migration, route, asset.
#  Habis upgrade panel, jalankan ulang file ini.
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR — jalanin dengan PANEL_DIR=/folder/panel"; exit 1; }
[ -f "$REPO_DIR/profile/routes/profile.php" ] || { echo "[!] Folder profile/ ga ada — git pull dulu."; exit 1; }

echo "[*] Panel : $PANEL_DIR"
echo "[*] Theme : $REPO_DIR"

# cek GD
if ! php -m | grep -qi '\bgd\b'; then
  echo "[!] PHP GD extension belum terpasang. Install dulu: sudo apt install php-gd"
  exit 1
fi

BASE="$PANEL_DIR/routes/base.php"
TPL="$PANEL_DIR/resources/views/templates/base/core.blade.php"
WEBUSER="www-data"
id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"

# 1. copy controller + migration + route + asset
echo "[1/5] Copy controller, migration, route, asset..."
mkdir -p "$PANEL_DIR/app/Http/Controllers" \
  "$PANEL_DIR/database/migrations" \
  "$PANEL_DIR/routes" \
  "$PANEL_DIR/public/assets" \
  "$PANEL_DIR/storage/app/private/avatars"

cp "$REPO_DIR/profile/app/Http/Controllers/ProfileAvatarController.php" "$PANEL_DIR/app/Http/Controllers/"
cp "$REPO_DIR/profile/database/migrations/"*add_avatar_to_users.php "$PANEL_DIR/database/migrations/"
cp "$REPO_DIR/profile/routes/profile.php" "$PANEL_DIR/routes/"
cp "$REPO_DIR/assets/custom-profile.css" "$REPO_DIR/assets/custom-profile.js" "$PANEL_DIR/public/assets/"

# 2. daftarin route di base.php
echo "[2/5] Daftarin route profile.php..."
python3 - "$BASE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
marker = "/* PROFILE-PHOTO START"
if marker in src:
    print("[2/5] Route udah terdaftar")
else:
    anchor = "/* CHAT-ROOM END */"
    if anchor not in src:
        sys.exit("[!] Ga nemu anchor CHAT-ROOM END di base.php")
    inject = (
        "\n/* PROFILE-PHOTO START — upload foto profil (pterodactyl-theme) */\n"
        "require __DIR__ . '/profile.php';\n"
        "/* PROFILE-PHOTO END */"
    )
    src = src.replace(anchor, anchor + inject, 1)
    open(p, "w").write(src)
    print("[2/5] Route profile.php didaftarin")
PYEOF

# 3. patch User model (fillable + accessor)
echo "[3/5] Patch User model..."
python3 - "$PANEL_DIR/app/Models/User.php" "$REPO_DIR/profile/app/Models/User.php.orig" <<'PYEOF'
import sys
p, pristine = sys.argv[1], sys.argv[2]
src = open(p).read()
if "getAvatarUrlAttribute" in src:
    print("[3/5] User model udah di-patch")
else:
    # add fillable
    if "'avatar_path'," not in src:
        anchor = "        'gravatar',\n        'root_admin',"
        if anchor not in src:
            sys.exit("[!] Ga nemu anchor fillable gravatar di User.php")
        src = src.replace(anchor, "        'gravatar',\n        'avatar_path',\n        'root_admin',", 1)
    # add accessor before "Default values" block
    anchor = "    /**\n     * Default values for specific fields in the database.\n     */"
    if anchor not in src:
        sys.exit("[!] Ga nemu anchor Default values di User.php")
    accessor = (
        "    /**\n"
        "     * URL foto profil (kalau ada) atau null.\n"
        "     */\n"
        "    public function getAvatarUrlAttribute(): ?string\n"
        "    {\n"
        "        if (!$this->avatar_path) {\n"
        "            return null;\n"
        "        }\n"
        "        return '/profile/avatar/' . (int) $this->id . '?v=' . substr((string) $this->updated_at, -8);\n"
        "    }\n\n"
        "    /**\n"
        "     * Default values for specific fields in the database.\n"
        "     */"
    )
    src = src.replace(anchor, accessor, 1)
    open(p, "w").write(src)
    print("[3/5] User model di-patch (fillable + accessor)")
PYEOF

# 4. migration
echo "[4/5] Jalanin migration..."
php "$PANEL_DIR/artisan" migrate --force 2>/dev/null \
  || sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" migrate --force

# 5. inject CSS/JS ke template + bump chat version
echo "[5/5] Inject CSS/JS ke template..."
python3 - "$TPL" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
changed = False
if "custom-profile.css" not in src:
    anchor = '<link rel="stylesheet" href="/assets/custom-widgets.css?v=7">'
    if anchor in src:
        src = src.replace(anchor, anchor + '\n    <link rel="stylesheet" href="/assets/custom-profile.css?v=1">', 1)
        changed = True
if "custom-profile.js" not in src:
    anchor = '<script src="/assets/custom-widgets.js?v=7"></script>'
    if anchor in src:
        src = src.replace(anchor, anchor + '\n    <script src="/assets/custom-profile.js?v=4"></script>', 1)
        changed = True
# bump chat css/js version
src = src.replace("custom-chat.css?v=3", "custom-chat.css?v=4")
src = src.replace("custom-chat.js?v=7", "custom-chat.js?v=9")
# add data-user-id to app div
if 'data-user-id' not in src:
    anchor = '<div id="app"></div>'
    if anchor in src:
        src = src.replace(anchor, '<div id="app" data-user-id="{{ auth()->user()->id ?? 0 }}"></div>', 1)
        changed = True
if changed or "custom-chat.css?v=4" in src:
    open(p, "w").write(src)
    print("[5/5] Template di-inject (CSS + JS + chat version bump)")
else:
    print("[5/5] Template udah ada tag profile")
PYEOF

# fix permissions
chown -R "$WEBUSER:$WEBUSER" \
  "$PANEL_DIR/app/Http/Controllers/ProfileAvatarController.php" \
  "$PANEL_DIR/app/Models/User.php" \
  "$PANEL_DIR/routes/profile.php" "$PANEL_DIR/routes/base.php" \
  "$PANEL_DIR/database/migrations" \
  "$PANEL_DIR/public/assets/custom-profile.css" "$PANEL_DIR/public/assets/custom-profile.js" \
  "$PANEL_DIR/resources/views" \
  "$PANEL_DIR/storage/app/private" 2>/dev/null || true

# clear cache
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" route:clear 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:cache 2>/dev/null || true

echo ""
echo "[✓] Profile photo terpasang!"
echo "    Upload: /account (kartu 'Foto Profil' paling atas)"
echo "    Tampil: chat room + navbar (semua halaman panel)"
echo "    Simpan: storage/app/private/avatars/{user_id}.jpg (256x256 JPEG)"
echo "    Butuh: php-gd (sudah dicek)"
echo "    Uninstall: sudo ./profile-uninstall.sh"
