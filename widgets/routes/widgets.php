<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\WidgetController;

/*
 * Widget dashboard (status jaringan, server saya, kuota, node health).
 * Satu endpoint, data global di-cache 60 detik.
 */
Route::get('/widgets/data', [WidgetController::class, 'data'])
    ->middleware(['auth', 'throttle:60,1'])
    ->name('widgets.data');

Route::get('/widgets/announcement', [WidgetController::class, 'announcementOnly'])
    ->middleware(['auth', 'throttle:60,1'])
    ->name('widgets.announcement');
