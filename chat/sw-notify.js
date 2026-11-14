/* CHAT-ROOM START — service worker kecil khusus notifikasi (pterodactyl-theme).
   Ga intercept network/cache apa-apa — cuma notifikasi chat + pengumuman. */

self.addEventListener('notificationclick', function (event) {
  var data = event.notification.data || {};
  var isAnnouncement = data.type === 'announcement';
  var targetUrl = isAnnouncement ? (data.url || '/') : '/?chat=1';
  var messageType = isAnnouncement ? 'pterowidget:open' : 'pterochat:open';

  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) {
          list[i].postMessage({ type: messageType });
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

/* Siap buat Web Push (kalau nanti VAPID + subscription dipasang).
   Sekarang belum dipakai karena notifikasi pengumuman masih lokal. */
self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }

  var title = data.title || '📢 Pengumuman Baru';
  var options = {
    body: data.body || data.text || 'Buka panel buat lihat detail pengumuman.',
    icon: data.icon || '/favicons/android-chrome-192x192.png',
    badge: data.badge || '/favicons/android-chrome-192x192.png',
    tag: data.tag || 'dw-push',
    renotify: true,
    data: { type: 'announcement', url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* CHAT-ROOM END */
