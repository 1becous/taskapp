// Firebase конфігурація
// Замініть ці значення на ваші з Firebase Console
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

// Отримання Firestore
const db = firebase.firestore();

// Функція для збереження стану в Firebase
async function saveStateToFirebase() {
    try {
        const state = {
            right: Array.from(rightBlock.children).map(el => ({ 
                id: el.id, 
                text: el.textContent 
            })),
            center: Array.from(centerBlock.children).map(el => ({ 
                id: el.id, 
                text: el.textContent 
            })),
            left: Array.from(leftBlock.children).map(el => ({ 
                id: el.id, 
                text: el.textContent 
            })),
            lastUpdated: new Date().toISOString()
        };
        
        await db.collection('tasks').doc('main').set(state);
        console.log('Стан збережено в Firebase');
    } catch (error) {
        console.error('Помилка збереження:', error);
    }
}

// Функція для завантаження стану з Firebase
async function loadStateFromFirebase() {
    try {
        const doc = await db.collection('tasks').doc('main').get();
        
        if (doc.exists) {
            const state = doc.data();
            
            // Очищаємо всі блоки
            rightBlock.innerHTML = '';
            centerBlock.innerHTML = '';
            leftBlock.innerHTML = '';
            
            // Відновлюємо завдання
            state.right.forEach(task => {
                const taskElement = createNewTask(task.text);
                taskElement.id = task.id;
            });
            
            state.center.forEach(task => {
                const taskElement = createNewTask(task.text);
                taskElement.id = task.id;
                centerBlock.appendChild(taskElement);
            });
            
            state.left.forEach(task => {
                const taskElement = createNewTask(task.text);
                taskElement.id = task.id;
                leftBlock.appendChild(taskElement);
            });
            
            console.log('Стан завантажено з Firebase');
        } else {
            console.log('Документ не знайдено, використовуємо локальні дані');
            loadLocalState();
        }
    } catch (error) {
        console.error('Помилка завантаження:', error);
        loadLocalState();
    }
}

// Функція для завантаження локального стану (fallback)
function loadLocalState() {
    const savedState = localStorage.getItem('taskAppState');
    if (savedState) {
        const state = JSON.parse(savedState);
        
        // Очищаємо всі блоки
        rightBlock.innerHTML = '';
        centerBlock.innerHTML = '';
        leftBlock.innerHTML = '';
        
        // Відновлюємо завдання
        state.right.forEach(task => {
            const taskElement = createNewTask(task.text);
            taskElement.id = task.id;
        });
        
        state.center.forEach(task => {
            const taskElement = createNewTask(task.text);
            taskElement.id = task.id;
            centerBlock.appendChild(taskElement);
        });
        
        state.left.forEach(task => {
            const taskElement = createNewTask(task.text);
            taskElement.id = task.id;
            leftBlock.appendChild(taskElement);
        });
    }
}

// Функція для збереження локального стану (fallback)
function saveLocalState() {
    const state = {
        right: Array.from(rightBlock.children).map(el => ({ id: el.id, text: el.textContent })),
        center: Array.from(centerBlock.children).map(el => ({ id: el.id, text: el.textContent })),
        left: Array.from(leftBlock.children).map(el => ({ id: el.id, text: el.textContent }))
    };
    localStorage.setItem('taskAppState', JSON.stringify(state));
} 