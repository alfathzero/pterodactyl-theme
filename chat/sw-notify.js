/* CHAT-ROOM START — service worker kecil khusus notifikasi chat (pterodactyl-theme).
   Ga intercept network/cache apa-apa — cuma notifikasi. */

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) {
          list[i].postMessage({ type: 'pterochat:open' });
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/?chat=1');
    })
  );
});

/* CHAT-ROOM END */
