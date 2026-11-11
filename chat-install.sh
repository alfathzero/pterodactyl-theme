#!/usr/bin/env bash
# ============================================================
#  Chat Room installer — fitur chat global buat pterodactyl-theme
#  (orb menu: chat + developer + musik, reaksi, mention, mute)
#
#  Jalankan SETELAH ./install.sh :
#     sudo ./chat-install.sh
#  Panel di folder lain:
#     sudo PANEL_DIR=/var/www/panel ./chat-install.sh
#
#  NB: installer ini nyentuh app code panel (controller/model/
#  migration/route) + bikin 3 tabel DB. Habis upgrade panel,
#  jalanin ulang file ini buat balikin route-nya.
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR — jalanin dengan PANEL_DIR=/folder/panel"; exit 1; }
[ -f "$REPO_DIR/chat/routes/chat.php" ] || { echo "[!] Folder chat/ ga ada — git pull dulu."; exit 1; }

echo "[*] Panel : $PANEL_DIR"
echo "[*] Theme : $REPO_DIR"

BASE="$PANEL_DIR/routes/base.php"

# 1. backup route asli dulu
if [ ! -f "$BASE.bak-chat" ]; then
  cp "$BASE" "$BASE.bak-chat"
  echo "[1/6] Backup routes/base.php -> base.php.bak-chat"
else
  echo "[1/6] Backup route udah ada, lanjut"
fi

# 2. file backend
echo "[2/6] Copy controller, model, migration, route..."
mkdir -p "$PANEL_DIR/app/Http/Controllers" "$PANEL_DIR/app/Models" "$PANEL_DIR/database/migrations" "$PANEL_DIR/routes"
cp "$REPO_DIR/chat/app/Http/Controllers/ChatController.php" "$PANEL_DIR/app/Http/Controllers/"
cp "$REPO_DIR/chat/app/Models/ChatMessage.php" "$PANEL_DIR/app/Models/"
cp "$REPO_DIR/chat/app/Models/ChatReaction.php" "$PANEL_DIR/app/Models/"
cp "$REPO_DIR/chat/app/Models/ChatMute.php" "$PANEL_DIR/app/Models/"
cp "$REPO_DIR"/chat/database/migrations/*create_chat_room_tables.php "$PANEL_DIR/database/migrations/"
cp "$REPO_DIR/chat/routes/chat.php" "$PANEL_DIR/routes/"

# 3. sisipin require chat.php SEBELUM catch-all SPA di routes/base.php
python3 - "$BASE" <<'PYEOF'
import sys
base = sys.argv[1]
src = open(base).read()
if "CHAT-ROOM START" in src:
    print("[3/6] require chat.php udah ada di routes/base.php")
else:
    block = ("/* CHAT-ROOM START — custom chat room (pterodactyl-theme) */\n"
             "require __DIR__ . '/chat.php';\n"
             "/* CHAT-ROOM END */\n\n")
    i = src.find("Route::")
    if i == -1:
        sys.exit("[!] Ga nemu 'Route::' di base.php — sisipin manual: require __DIR__.'/chat.php'; di paling awal")
    open(base, "w").write(src[:i] + block + src[i:])
    print("[3/6] require chat.php disisipin ke routes/base.php")
PYEOF

# 4. bikin tabel
echo "[4/6] Migration (buat tabel chat_*)..."
php "$PANEL_DIR/artisan" migrate --force 2>/dev/null \
  || sudo -u www-data php "$PANEL_DIR/artisan" migrate --force

# 5. assets + cache + permission
echo "[5/6] Assets + clear cache + permission..."
for f in custom-chat.css custom-chat.js custom-orb.css custom-orb.js; do
  cp "$REPO_DIR/assets/$f" "$PANEL_DIR/public/assets/$f"
done
# service worker buat notifikasi chat (di root public, bukan /assets)
[ -f "$REPO_DIR/chat/sw-notify.js" ] && cp "$REPO_DIR/chat/sw-notify.js" "$PANEL_DIR/public/sw-notify.js"

# 6. auto-prune: pesan lebih tua dari 24 jam dihapus otomatis (cron www-data)
echo "[6/6] Cron auto-prune (pesan >24 jam)..."
if [ -f "$REPO_DIR/chat/app/Console/Commands/ChatPruneCommand.php" ]; then
  mkdir -p "$PANEL_DIR/app/Console/Commands"
  cp "$REPO_DIR/chat/app/Console/Commands/ChatPruneCommand.php" "$PANEL_DIR/app/Console/Commands/"
fi
CRON_TAG="pterochat-prune (pterodactyl-theme)"
CRON_LINE="*/30 * * * * php $PANEL_DIR/artisan chat:prune --hours=24 > /dev/null 2>&1"
TMPCT="$(mktemp)"
crontab -u www-data -l 2>/dev/null | grep -v -e 'pterochat-prune' -e "$PANEL_DIR/artisan chat:prune" > "$TMPCT" || true
{ cat "$TMPCT"; echo "# pterochat-prune START ($CRON_TAG)"; echo "$CRON_LINE"; echo "# pterochat-prune END"; } | crontab -u www-data -
rm -f "$TMPCT"
echo "    cron: tiap 30 menit hapus pesan > 24 jam"
sudo -u www-data php "$PANEL_DIR/artisan" route:clear 2>/dev/null || php "$PANEL_DIR/artisan" route:clear
sudo -u www-data php "$PANEL_DIR/artisan" config:clear 2>/dev/null || true
sudo -u www-data php "$PANEL_DIR/artisan" view:clear 2>/dev/null || true
WEBUSER="www-data"
id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"
chown -R "$WEBUSER:$WEBUSER" "$PANEL_DIR/app" "$PANEL_DIR/routes" "$PANEL_DIR/database/migrations" "$PANEL_DIR/storage" "$PANEL_DIR/bootstrap/cache" "$PANEL_DIR/public/assets" 2>/dev/null || true

echo ""
echo "[✓] Chat Room aktif!"
echo "    Tap orb di pojok kanan bawah → bola ungu 'Chat Room'."
echo "    Uninstall: sudo ./chat-uninstall.sh"
