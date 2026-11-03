<?php

/* CHAT-ROOM START — custom chat room tables (part of pterodactyl-theme) */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_messages', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->text('body');
            $table->json('mentions')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['id', 'user_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('chat_reactions', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('message_id');
            $table->unsignedInteger('user_id');
            $table->string('emoji', 16);
            $table->timestamp('created_at')->nullable();

            $table->unique(['message_id', 'user_id', 'emoji']);
            $table->foreign('message_id')->references('id')->on('chat_messages')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('chat_mutes', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('muted_by')->nullable();
            $table->timestamp('muted_until');
            $table->string('reason', 190)->nullable();
            $table->timestamp('created_at')->nullable();

            $table->unique('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('muted_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_reactions');
        Schema::dropIfExists('chat_mutes');
        Schema::dropIfExists('chat_messages');
    }
};

/* CHAT-ROOM END */
