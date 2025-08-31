// /firebase-messaging-sw.js  (корінь https://1becous.github.io)
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

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
  // іконка з вашого PROJECT Pages (шлях від кореня домену!)
  self.registration.showNotification(n.title || 'Нове сповіщення', {
    body: n.body || '',
    icon: '/taskapp/icons/192.jpg',
    data: payload?.fcmOptions?.link || payload?.data?.url || '/taskapp/'
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data || '/taskapp/';
  event.waitUntil(self.clients.openWindow(url));
});
