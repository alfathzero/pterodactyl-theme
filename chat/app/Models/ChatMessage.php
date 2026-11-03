<?php

/* CHAT-ROOM START — custom chat room (part of pterodactyl-theme) */

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ChatMessage extends Model
{
    use SoftDeletes;

    protected $table = 'chat_messages';

    protected $guarded = [];

    protected $casts = [
        'mentions' => 'array',
        'deleted_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        // jangan ke-filter scope isolation milik addon lain (Sano Protect)
        return $this->belongsTo(User::class)->withoutGlobalScope('sano_user_isolation');
    }
}

/* CHAT-ROOM END */
