# 🔥 Налаштування Firebase для спільної історії завдань

## Крок 1: Створення проекту Firebase

1. Перейдіть на [Firebase Console](https://console.firebase.google.com/)
2. Натисніть "Створити проект"
3. Введіть назву проекту (наприклад, "task-app")
4. Відключіть Google Analytics (необов'язково)
5. Натисніть "Створити проект"

## Крок 2: Налаштування Firestore Database

1. У Firebase Console перейдіть до "Firestore Database"
2. Натисніть "Створити базу даних"
3. Виберіть "Тестовий режим" (для початку)
4. Виберіть регіон (наприклад, "europe-west1")
5. Натисніть "Готово"

## Крок 3: Отримання конфігурації

1. У Firebase Console перейдіть до "Налаштування проекту" (⚙️)
2. Перейдіть на вкладку "Загальні"
3. Прокрутіть до "Ваші додатки"
4. Натисніть на веб-іконку (</>)
5. Введіть назву додатку (наприклад, "task-app-web")
6. Натисніть "Зареєструвати додаток"
7. Скопіюйте конфігурацію

## Крок 4: Оновлення конфігурації

Замініть значення в файлі `js/firebase-config.js`:

```javascript
const firebaseConfig = {
    apiKey: "ВАШ_API_KEY",
    authDomain: "ВАШ_PROJECT_ID.firebaseapp.com",
    projectId: "ВАШ_PROJECT_ID",
    storageBucket: "ВАШ_PROJECT_ID.appspot.com",
    messagingSenderId: "ВАШ_SENDER_ID",
    appId: "ВАШ_APP_ID"
};
```

## Крок 5: Налаштування правил Firestore

У Firebase Console перейдіть до "Firestore Database" → "Правила" і встановіть:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // Для тестування
    }
  }
}
```

## Крок 6: Завантаження на GitHub Pages

1. Створіть репозиторій на GitHub
2. Завантажте всі файли
3. Перейдіть до Settings → Pages
4. Виберіть "Deploy from a branch"
5. Виберіть гілку "main"
6. Натисніть "Save"

## 🔧 Альтернативні варіанти

### 1. **Supabase (Безкоштовний)**
- PostgreSQL база даних
- Realtime функціональність
- Простіше налаштування

### 2. **MongoDB Atlas (Безкоштовний)**
- MongoDB база даних
- REST API
- Потрібен backend

### 3. **JSON Server (Для тестування)**
- Локальний сервер
- JSON файл як база даних
- Тільки для розробки

## 🚀 Переваги Firebase

✅ **Безкоштовний** - 50,000 читання/день  
✅ **Realtime** - оновлення в реальному часі  
✅ **Простий** - мінімум налаштувань  
✅ **Безпечний** - вбудована автентифікація  
✅ **Масштабований** - автоматичне масштабування  

## 📊 Моніторинг використання

У Firebase Console ви можете бачити:
- Кількість запитів
- Використання трафіку
- Помилки
- Активних користувачів

## 🔒 Безпека

Для продакшену змініть правила Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks/{document} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Це дозволить доступ тільки авторизованим користувачам. 