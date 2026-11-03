<?php

/* CHAT-ROOM START — custom chat room (part of pterodactyl-theme) */

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;

class ChatMute extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'chat_mutes';

    protected $guarded = [];

    protected $casts = [
        'muted_until' => 'datetime',
    ];
}

/* CHAT-ROOM END */
