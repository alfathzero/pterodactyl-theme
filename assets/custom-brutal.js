// Neo-Brutalism dashboard (pterodactyl-theme)
// Aktifin class body cuma di halaman dashboard biar halaman lain aman.
(function () {
  'use strict';

  function apply() {
    var path = window.location.pathname.replace(/\/+$/, '');
    if (path === '') document.body.classList.add('brutal-dash');
    else document.body.classList.remove('brutal-dash');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
