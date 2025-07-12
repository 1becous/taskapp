// Firebase конфігурація
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

// Ініціалізація Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
