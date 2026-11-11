#!/usr/bin/env bash
# ============================================================
#  Chat Room uninstaller — balikin panel ke sebelum chat aktif
#  (hapus file backend + drop tabel chat_* + restore route)
#
#     sudo ./chat-uninstall.sh
#  Hapus pesan chat juga dari DB? Tabel di-drop = semua hilang.
# ============================================================
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
[ "$(id -u)" -eq 0 ] || { echo "[!] Jalankan sebagai root (sudo)."; exit 1; }
[ -f "$PANEL_DIR/artisan" ] || { echo "[!] Panel ga ketemu di $PANEL_DIR"; exit 1; }

read -rp "[?] Drop tabel chat_* (semua pesan hilang permanen)? [y/N] " ans || ans=N
BASE="$PANEL_DIR/routes/base.php"

echo "[*] Buang require chat.php dari routes/base.php..."
python3 - "$BASE" <<'PYEOF'
import sys, re
base = sys.argv[1]
src = open(base).read()
if "/* CHAT-ROOM START" not in src:
    print("    (ga ada blok CHAT-ROOM, skip)")
else:
    src = re.sub(r"/\* CHAT-ROOM START.*?/\* CHAT-ROOM END \*/\n\n", "", src, flags=re.S)
    open(base, "w").write(src)
    print("    dibuang")
PYEOF

if [ "${ans,,}" = "y" ]; then
  echo "[*] Drop tabel chat_*..."
  php "$PANEL_DIR/artisan" tinker --execute="
        \Schema::dropIfExists('chat_reactions');
        \Schema::dropIfExists('chat_mutes');
        \Schema::dropIfExists('chat_messages');
        \DB::table('migrations')->where('migration', 'like', '%create_chat_room_tables%')->delete();
        echo '  tabel chat dihapus + catatan migration dibersihin';" 2>/dev/null \
    || echo "[!] Drop otomatis gagal — hapus manual tabel chat_messages/chat_reactions/chat_mutes + baris migration create_chat_room_tables"
else
  echo "[*] Tabel chat_* DIBIARIN (pesan ga hilang)."
fi

echo "[*] Buang cron auto-prune..."
if crontab -u www-data -l 2>/dev/null | grep -q "pterochat-prune"; then
  TMPCT="$(mktemp)"
  crontab -u www-data -l | sed '/# pterochat-prune START/,/# pterochat-prune END/d' | grep -v "artisan chat:prune" > "$TMPCT" || true
  crontab -u www-data "$TMPCT"
  rm -f "$TMPCT"
  echo "    cron prune dibuang"
else
  echo "    (ga ada cron prune, skip)"
fi

echo "[*] Hapus file backend + assets chat..."
rm -f "$PANEL_DIR/app/Http/Controllers/ChatController.php" \
      "$PANEL_DIR/app/Console/Commands/ChatPruneCommand.php" \
      "$PANEL_DIR/app/Models/ChatMessage.php" \
      "$PANEL_DIR/app/Models/ChatReaction.php" \
      "$PANEL_DIR/app/Models/ChatMute.php" \
      "$PANEL_DIR/routes/chat.php" \
      "$PANEL_DIR"/database/migrations/*create_chat_room_tables.php \
      "$PANEL_DIR/public/assets/custom-chat.css" \
      "$PANEL_DIR/public/assets/custom-chat.js" \
      "$PANEL_DIR/public/sw-notify.js" \
      "$PANEL_DIR/routes/base.php.bak-chat"

WEBUSER="www-data"; id -u nginx >/dev/null 2>&1 && WEBUSER="nginx"
sudo -u www-data php "$PANEL_DIR/artisan" route:clear 2>/dev/null || php "$PANEL_DIR/artisan" route:clear
php "$PANEL_DIR/artisan" config:clear >/dev/null 2>&1 || true
php "$PANEL_DIR/artisan" view:clear >/dev/null 2>&1 || true
chown -R "$WEBUSER:$WEBUSER" "$PANEL_DIR/app" "$PANEL_DIR/routes" "$PANEL_DIR/public/assets" "$PANEL_DIR/storage" 2>/dev/null || true

echo ""
echo "[✓] Chat Room dibersihin. (kalau mau hapus tema total: ./uninstall.sh)"
