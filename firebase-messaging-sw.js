// /firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCbSXhG79R6WNNTh-JrefUmQ7SIe820NtA",
  authDomain: "taskapp-d16fb.firebaseapp.com",
  databaseURL: "https://taskapp-d16fb-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "taskapp-d16fb",
  storageBucket: "taskapp-d16fb.firebasestorage.app",
  messagingSenderId: "29293293823",
  appId: "1:29293293823:web:232622a87d0704f1aedcca",
  measurementId: "G-1MTJE7K509"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Кастомна обробка бекґраунд-повідомлень (не обов'язково)
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = (payload?.notification || {});
  self.registration.showNotification(title || 'Нове сповіщення', {
    body: body || '',
    icon: icon || '/icons/192.png',
    data: payload?.fcmOptions?.link || payload?.data?.url || '/'
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data || '/';
  event.waitUntil(clients.openWindow(url));
});
