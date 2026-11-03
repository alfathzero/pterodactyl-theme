<?php

/* CHAT-ROOM START — custom chat room (part of pterodactyl-theme) */

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;

class ChatReaction extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'chat_reactions';

    protected $guarded = [];
}

/* CHAT-ROOM END */
