<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\LeaderboardController;

/*
 * Leaderboard resource server (global, semua user login).
 * Data dibaca dari cache collector leaderboard:collect.
 */
Route::get('/leaderboard/servers', [LeaderboardController::class, 'index'])->name('leaderboard.servers');
