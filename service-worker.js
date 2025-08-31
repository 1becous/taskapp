/* service-worker.js */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// миттєве оновлення SW
self.skipWaiting();
workbox.core.clientsClaim();

/** 1) PRECACHE (App Shell). 
 *  Після зміни будь-якого з цих файлів — підвищуй revision.
 *  Або додай ?v=XXX у index.html для css/js.
 */
workbox.precaching.precacheAndRoute([
  {url: '/',                  revision: '1'},
  {url: '/index.html',        revision: '5'},
  {url: '/css/normal.css',    revision: '1'},
  {url: '/css/main.css',      revision: '1'},
  {url: '/js/firebase-config.js', revision: '1'},
  {url: '/js/script.js',      revision: '1'},
  {url: '/manifest.json',     revision: '1'},
  {url: '/icons/192.png',     revision: '1'},
  {url: '/icons/192.ico',     revision: '1'},
]);

// 2) НЕ кешувати FCM SW — лише мережа
workbox.routing.registerRoute(
  ({url}) => url.pathname === '/firebase-messaging-sw.js',
  new workbox.strategies.NetworkOnly()
);

// 3) HTML навігації — NetworkFirst з фолбеком офлайн
workbox.routing.registerRoute(
  ({request}) => request.mode === 'navigate',
  new workbox.strategies.NetworkFirst({
    cacheName: 'html',
    networkTimeoutSeconds: 3,
    plugins: [ new workbox.expiration.ExpirationPlugin({ maxEntries: 20 }) ]
  })
);

// 4) CSS/JS — StaleWhileRevalidate
workbox.routing.registerRoute(
  ({request}) => request.destination === 'style' || request.destination === 'script',
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [ new workbox.expiration.ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7*24*60*60 }) ]
  })
);

// 5) Зображення/іконки — CacheFirst
workbox.routing.registerRoute(
  ({request}) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: 'images',
    plugins: [ new workbox.expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30*24*60*60 }) ]
  })
);

// 6) Google Fonts
workbox.routing.registerRoute(
  ({url}) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'google-fonts' })
);

// 7) Offline fallback для документів
const FALLBACK_URL = '/index.html';
workbox.routing.setCatchHandler(async ({event}) => {
  if (event.request.destination === 'document') {
    return caches.match(FALLBACK_URL);
  }
  return Response.error();
});
