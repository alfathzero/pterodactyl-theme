#!/usr/bin/env bash
# ============================================================
#  Admin Orb patch — biar orb (chat/telegram/musik) muncul juga
#  di halaman /admin, tanpa nimpa layout admin (aman buat upgrade).
#
#  Jalankan setelah ./install.sh :
#     sudo ./admin-patch.sh
#  Cabut patch:
#     sudo ./admin-patch.sh --remove
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
ADMIN="$PANEL_DIR/resources/views/layouts/admin.blade.php"
REMOVE=0
[ "${1:-}" = "--remove" ] && REMOVE=1

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$ADMIN" ] || { echo "[!] Layout admin ga ketemu: $ADMIN"; exit 1; }

# versi asset ngikut template biar selalu sinkron
pick_ver() {
  grep -oE "$1\?v=[0-9]+" "$REPO_DIR/templates/base-core.blade.php" 2>/dev/null | head -n1 | sed 's/.*=//' || true
}
ORB_CSS_V="$(pick_ver 'custom-orb\.css')"; : "${ORB_CSS_V:=8}"
ORB_JS_V="$(pick_ver 'custom-orb\.js')";  : "${ORB_JS_V:=14}"
CHAT_CSS_V="$(pick_ver 'custom-chat\.css')"; : "${CHAT_CSS_V:=3}"
CHAT_JS_V="$(pick_ver 'custom-chat\.js')";  : "${CHAT_JS_V:=6}"

if [ "$REMOVE" = "1" ]; then
  python3 - "$ADMIN" <<'PYEOF'
import re, sys
p = sys.argv[1]
src = open(p).read()
src = re.sub(r"[ \t]*<!-- THEME-ADMIN-CSS START.*?-->.*?<!-- THEME-ADMIN-CSS END -->\n?", "", src, flags=re.S)
src = re.sub(r"[ \t]*<!-- THEME-ADMIN-JS START.*?-->.*?<!-- THEME-ADMIN-JS END -->\n?", "", src, flags=re.S)
open(p, "w").write(src)
print("[*] Patch orb admin dicabut")
PYEOF
  WEBUSER="www-data"; id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"
  sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:clear 2>/dev/null || php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true
  echo "[✓] Selesai."
  exit 0
fi

# backup sekali aja
[ -f "$ADMIN.bak-theme-admin" ] || cp "$ADMIN" "$ADMIN.bak-theme-admin"

python3 - "$ADMIN" "$ORB_CSS_V" "$CHAT_CSS_V" "$ORB_JS_V" "$CHAT_JS_V" <<'PYEOF'
import re, sys
p, oc, cc, oj, cj = sys.argv[1:6]
src = open(p).read()
changed = []

if "THEME-ADMIN-CSS START" not in src:
    css = (
        "        <!-- THEME-ADMIN-CSS START (pterodactyl-theme) -->\n"
        f'        <link rel="stylesheet" href="/assets/custom-orb.css?v={oc}">\n'
        f'        <link rel="stylesheet" href="/assets/custom-chat.css?v={cc}">\n'
        "        <!-- THEME-ADMIN-CSS END -->\n"
    )
    i = src.find("</head>")
    if i != -1:
        src = src[:i] + css + src[i:]
        changed.append("CSS")
    else:
        print("[!] </head> ga ketemu — CSS admin dilewati")

if "THEME-ADMIN-JS START" not in src:
    js = (
        "        <!-- THEME-ADMIN-JS START (pterodactyl-theme) -->\n"
        f'        <script src="/assets/custom-orb.js?v={oj}"></script>\n'
        f'        <script src="/assets/custom-chat.js?v={cj}"></script>\n'
        "        <!-- THEME-ADMIN-JS END -->\n"
    )
    i = src.find("</body>")
    if i != -1:
        src = src[:i] + js + src[i:]
        changed.append("JS")
    else:
        print("[!] </body> ga ketemu — JS admin dilewati")

# selalu sinkronin versi asset (biar upgrade tema langsung kepakai di /admin)
synced = src
synced = re.sub(r'/assets/custom-orb\.css\?v=\d+', f'/assets/custom-orb.css?v={oc}', synced)
synced = re.sub(r'/assets/custom-chat\.css\?v=\d+', f'/assets/custom-chat.css?v={cc}', synced)
synced = re.sub(r'/assets/custom-orb\.js\?v=\d+', f'/assets/custom-orb.js?v={oj}', synced)
synced = re.sub(r'/assets/custom-chat\.js\?v=\d+', f'/assets/custom-chat.js?v={cj}', synced)
if synced != src:
    changed.append("versi asset")
    src = synced

if changed:
    open(p, "w").write(src)
    print("[*] Patch orb admin dipasang/diupdate: " + ", ".join(changed))
else:
    print("[*] Patch orb admin udah ada, skip")
PYEOF

WEBUSER="www-data"; id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"
chown "$WEBUSER:$WEBUSER" "$ADMIN" 2>/dev/null || true
sudo -u "$WEBUSER" php "$PANEL_DIR/artisan" view:clear 2>/dev/null || php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true
echo "[✓] Orb sekarang muncul juga di /admin."
