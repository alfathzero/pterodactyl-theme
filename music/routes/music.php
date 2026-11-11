<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\Music\MusicUploadController;

/*
 * Orb musik — playlist per akun.
 * File lagu disimpan privat di storage/app/music dan hanya bisa
 * di-stream lewat route ini (butuh login + pemilik lagu).
 */
Route::prefix('/music')->group(function () {
    Route::get('/playlist', [MusicUploadController::class, 'index'])->name('music.playlist');
    Route::get('/stream/{file}', [MusicUploadController::class, 'stream'])->name('music.stream');
    Route::post('/upload', [MusicUploadController::class, 'store'])->name('music.upload');
    Route::delete('/{file}', [MusicUploadController::class, 'destroy'])->name('music.destroy');
});
