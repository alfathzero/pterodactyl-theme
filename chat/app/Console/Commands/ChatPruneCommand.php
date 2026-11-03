<?php

/* CHAT-ROOM START — auto-prune pesan chat lama (part of pterodactyl-theme) */

namespace Pterodactyl\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Pterodactyl\Models\ChatMessage;
use Pterodactyl\Models\ChatMute;

class ChatPruneCommand extends Command
{
    protected $signature = 'chat:prune {--hours=24 : Umur pesan (jam) yang dianggap tua}';

    protected $description = 'Hapus permanen pesan chat yang lebih tua dari batas jam (default 24 jam)';

    public function handle(): int
    {
        $hours = max(1, (int) $this->option('hours'));
        $cutoff = Carbon::now()->subHours($hours);

        // forceDelete beneran ngilangin baris (termasuk yang udah soft-deleted),
        // reactions ikut kehapus via FK cascade di level DB.
        $deleted = ChatMessage::withTrashed()->where('created_at', '<', $cutoff)->forceDelete();

        // sekalian bersihin mute yang udah kedaluwarsa
        $mutes = ChatMute::query()->where('muted_until', '<', Carbon::now())->delete();

        if ($deleted > 0 || $mutes > 0) {
            $this->info("chat:prune -> {$deleted} pesan lama dihapus, {$mutes} mute expired dibersihin (cutoff {$hours} jam)");
        } else {
            $this->line('chat:prune -> ga ada yang perlu dibersihin');
        }

        return self::SUCCESS;
    }
}

/* CHAT-ROOM END */
