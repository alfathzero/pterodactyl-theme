<?php

/* PROFILE-PHOTO START — route upload/hapus/serve foto profil (pterodactyl-theme) */

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\ProfileAvatarController;

Route::prefix('profile')->middleware('auth')->group(function () {
    Route::get('/avatar/{id}', [ProfileAvatarController::class, 'show'])
        ->whereNumber('id')
        ->name('profile.avatar.show');
    Route::post('/avatar', [ProfileAvatarController::class, 'update'])
        ->middleware('throttle:10,1')
        ->name('profile.avatar.update');
    Route::delete('/avatar', [ProfileAvatarController::class, 'destroy'])
        ->middleware('throttle:10,1')
        ->name('profile.avatar.destroy');
    Route::get('/me', [ProfileAvatarController::class, 'me'])
        ->name('profile.me');
});

/* PROFILE-PHOTO END */
