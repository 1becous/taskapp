/* service-worker.js — Workbox + Firebase Messaging */

// ---- Firebase Messaging (бекграунд пуші) ----
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCbSXhG79R6WNNTh-JrefUmQ7SIe820NtA",
  authDomain: "taskapp-d16fb.firebaseapp.com",
  databaseURL: "https://taskapp-d16fb-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "taskapp-d16fb",
  storageBucket: "taskapp-d16fb.firebasestorage.app",
  messagingSenderId: "29293293823",
  appId: "1:29293293823:web:232622a87d0704f1aedcca",
  measurementId: "G-1MTJE7K509"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload?.notification || {};
  self.registration.showNotification(n.title || 'Нове сповіщення', {
    body: n.body || '',
    icon: '/icons/192.jpg', // зміни на свій існуючий файл за потреби
    data: payload?.fcmOptions?.link || payload?.data?.url || '/'
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data || '/';
  event.waitUntil(self.clients.openWindow(url));
});
// ---- кінець блоку Firebase ----

// ---- Workbox ----
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// миттєве оновлення
self.skipWaiting();
workbox.core.clientsClaim();

// App Shell: підвищуй revision при змінах
workbox.precaching.precacheAndRoute([
  { url: '/',                   revision: '1' },
  { url: '/index.html',         revision: '6' },
  { url: '/css/normal.css',     revision: '1' },
  { url: '/css/main.css',       revision: '1' },
  { url: '/js/firebase-config.js', revision: '1' },
  { url: '/js/script.js',       revision: '2' },
  { url: '/manifest.json',      revision: '1' },
  { url: '/icons/192.jpg',      revision: '1' },
  { url: '/icons/192.ico',      revision: '1' },
  { url: '/icons/512.jpg',      revision: '1' }
]);

// не чіпаємо окремий FCM SW, якщо він раптом існує
workbox.routing.registerRoute(
  ({url}) => url.pathname === '/firebase-messaging-sw.js',
  new workbox.strategies.NetworkOnly()
);

// HTML: NetworkFirst для свіжих оновлень
workbox.routing.registerRoute(
  ({request}) => request.mode === 'navigate',
  new workbox.strategies.NetworkFirst({
    cacheName: 'html',
    networkTimeoutSeconds: 3,
    plugins: [ new workbox.expiration.ExpirationPlugin({ maxEntries: 20 }) ]
  })
);

// CSS/JS: StaleWhileRevalidate
workbox.routing.registerRoute(
  ({request}) => request.destination === 'style' || request.destination === 'script',
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'static',
    plugins: [ new workbox.expiration.ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7*24*60*60 }) ]
  })
);

// Зображення: CacheFirst
workbox.routing.registerRoute(
  ({request}) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: 'images',
    plugins: [ new workbox.expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30*24*60*60 }) ]
  })
);

// Google Fonts
workbox.routing.registerRoute(
  ({url}) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'google-fonts' })
);

// offline fallback для документів
const FALLBACK_URL = '/index.html';
workbox.routing.setCatchHandler(async ({event}) => {
  if (event.request.destination === 'document') {
    return caches.match(FALLBACK_URL);
  }
  return Response.error();
});
