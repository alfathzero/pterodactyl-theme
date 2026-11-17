<?php

/* PROFILE-PHOTO START — upload/hapus/serve foto profil (pterodactyl-theme) */

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Pterodactyl\Models\User;

class ProfileAvatarController extends Controller
{
    private const DISK = 'local';

    private const DIR = 'avatars';

    private const MAX_BYTES = 2_097_152; // 2 MB

    private const SIZE = 256;

    private const QUALITY = 88;

    private const MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    public function show(Request $request, int $id): Response
    {
        $user = $request->user();
        if (!$user) {
            abort(401);
        }

        // Hanya user sendiri atau admin yang boleh lihat (dan chat room butuh login).
        if ((int) $user->id !== $id && !$user->root_admin) {
            // Abaikan — avatar chat dilihat semua user login. Tapi kita tetap
            // batasi ke akun yang punya avatar_path biar nggak bocor email lewat hash.
            $target = User::query()->where('id', $id)->value('avatar_path');
            if (!$target) {
                abort(404);
            }
        }

        $owner = User::query()->find($id);
        if (!$owner || !$owner->avatar_path) {
            abort(404);
        }

        $disk = Storage::disk(self::DISK);
        $path = self::DIR . '/' . $owner->avatar_path;
        if (!$disk->exists($path)) {
            abort(404);
        }

        $etag = md5($owner->avatar_path . '/' . (string) $owner->updated_at);
        if ($request->header('If-None-Match') === $etag) {
            return new Response('', 304);
        }

        $mime = function_exists('mime_content_type')
            ? mime_content_type($disk->path($path))
            : 'image/jpeg';
        if ($mime === 'application/octet-stream' || !$mime) {
            $mime = 'image/jpeg';
        }

        return new Response($disk->get($path), 200, [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, max-age=3600',
            'ETag' => $etag,
            'Content-Length' => $disk->size($path),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return new JsonResponse(['error' => 'Unauthenticated'], 401);
        }

        $request->validate([
            'avatar' => ['required', 'file', 'max:' . (self::MAX_BYTES / 1024)],
        ]);

        $file = $request->file('avatar');
        if (!$file || !$file->isValid()) {
            return new JsonResponse(['error' => 'File ga valid'], 422);
        }

        $mime = $file->getMimeType();
        if (!in_array($mime, self::MIME, true)) {
            return new JsonResponse(['error' => 'Format harus jpg/png/webp/gif'], 422);
        }

        $src = $file->getRealPath();
        if (!is_file($src) || filesize($src) > self::MAX_BYTES) {
            return new JsonResponse(['error' => 'File kebesaran (maks 2 MB)'], 422);
        }

        $img = $this->loadImage($src, $mime);
        if (!$img) {
            return new JsonResponse(['error' => 'Gagal baca gambar'], 422);
        }

        $square = $this->cropSquare($img);
        $resized = imagescale($square, self::SIZE, self::SIZE);
        if (!$resized) {
            $resized = $square;
        }

        $disk = Storage::disk(self::DISK);
        $disk->makeDirectory(self::DIR);

        $name = (string) $user->id . '.jpg';
        $path = self::DIR . '/' . $name;
        $abs = $disk->path($path);

        // tulis JPEG
        $tmp = $abs . '.tmp';
        if (!imagejpeg($resized, $tmp, self::QUALITY)) {
            imagedestroy($resized);
            imagedestroy($img);
            return new JsonResponse(['error' => 'Gagal simpan gambar'], 500);
        }
        @chmod($tmp, 0644);
        @rename($tmp, $abs);

        imagedestroy($resized);
        if ($resized !== $img) {
            imagedestroy($img);
        }

        $user->avatar_path = $name;
        $user->save();

        return new JsonResponse([
            'ok' => true,
            'avatar_url' => $this->avatarUrl($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return new JsonResponse(['error' => 'Unauthenticated'], 401);
        }
        return new JsonResponse([
            'id' => $user->id,
            'username' => $user->username,
            'avatar' => $user->avatar_url,
        ]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return new JsonResponse(['error' => 'Unauthenticated'], 401);
        }

        if ($user->avatar_path) {
            $disk = Storage::disk(self::DISK);
            $path = self::DIR . '/' . $user->avatar_path;
            if ($disk->exists($path)) {
                $disk->delete($path);
            }
            $user->avatar_path = null;
            $user->save();
        }

        return new JsonResponse(['ok' => true]);
    }

    public static function avatarUrl(?User $user): ?string
    {
        if (!$user || !$user->avatar_path) {
            return null;
        }
        return '/profile/avatar/' . (int) $user->id . '?v=' . substr((string) $user->updated_at, -8);
    }

    private function loadImage(string $src, string $mime)
    {
        switch ($mime) {
            case 'image/jpeg':
                return @imagecreatefromjpeg($src);
            case 'image/png':
                return @imagecreatefrompng($src);
            case 'image/webp':
                return @imagecreatefromwebp($src);
            case 'image/gif':
                return @imagecreatefromgif($src);
        }
        return null;
    }

    private function cropSquare($img)
    {
        $w = imagesx($img);
        $h = imagesy($img);
        if ($w === $h) {
            return $img;
        }
        $size = min($w, $h);
        $x = (int) floor(($w - $size) / 2);
        $y = (int) floor(($h - $size) / 2);
        $square = imagecrop($img, ['x' => $x, 'y' => $y, 'width' => $size, 'height' => $size]);
        return $square ?: $img;
    }
}

/* PROFILE-PHOTO END */
