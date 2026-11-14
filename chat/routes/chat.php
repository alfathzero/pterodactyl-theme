<?php

/* CHAT-ROOM START — custom chat room routes (didaftarkan SEBELUM catch-all SPA).
   Dimuat dari routes/base.php oleh installer pterodactyl-theme. */

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\ChatController;

Route::prefix('chat')->middleware('auth')->group(function () {
    Route::get('/messages', [ChatController::class, 'index'])->middleware('throttle:60,1');
    Route::post('/messages', [ChatController::class, 'store'])->middleware('throttle:40,1');
    Route::delete('/messages/{id}', [ChatController::class, 'destroy'])
        ->whereNumber('id')->middleware('throttle:30,1');
    Route::post('/messages/{id}/react', [ChatController::class, 'react'])
        ->whereNumber('id')->middleware('throttle:60,1');
    Route::get('/users', [ChatController::class, 'users'])->middleware('throttle:30,1');
    Route::post('/mute/{userId}', [ChatController::class, 'mute'])
        ->whereNumber('userId')->middleware('throttle:10,1');
    Route::delete('/mute/{userId}', [ChatController::class, 'unmute'])
        ->whereNumber('userId')->middleware('throttle:10,1');
});

/* CHAT-ROOM END */
