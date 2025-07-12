// Отримання елементів DOM
let lists = document.getElementsByClassName("block_task-list");
let rightBlock = document.getElementById("right");
let centerBlock = document.getElementById("center");
let leftBlock = document.getElementById("left");
let newTaskInput = document.getElementById("new-task-input");
let addTaskBtn = document.getElementById("add-task-btn");

// Лічильник для унікальних ID завдань
let taskCounter = 9; // Починаємо з 9, оскільки вже є 8 завдань

// =================================================================
// 1. Функціональність додавання нових завдань
// =================================================================

// Функція для створення нового завдання
function createNewTask(taskText) {
    const newTask = document.createElement("div");
    newTask.className = "block_task-list";
    newTask.draggable = true;
    newTask.id = "task-" + taskCounter;
    newTask.textContent = taskText;
    
    // Додаємо обробники подій для нового завдання
    addDragHandlers(newTask);
    addClickHandlers(newTask);
    
    // Додаємо завдання до першого блоку (На редагування)
    rightBlock.appendChild(newTask);
    
    taskCounter++;
    return newTask;
}

// Функція для додавання обробників drag and drop до елемента
function addDragHandlers(element) {
    // Обробник початку перетягування (dragstart)
    element.addEventListener("dragstart", function(e) {
        e.dataTransfer.setData("text/plain", e.target.id);
        e.dataTransfer.effectAllowed = "move";
        e.target.classList.add("is-dragging");
        
        setTimeout(() => {
            e.target.style.opacity = "0.5";
        }, 0);
    });

    // Обробник закінчення перетягування (dragend)
    element.addEventListener("dragend", function(e) {
        e.target.classList.remove("is-dragging");
        e.target.style.opacity = "1";
    });

    // Обробники для покращення UX
    element.addEventListener("dragenter", function(e) {
        e.preventDefault();
    });

    element.addEventListener("dragover", function(e) {
        e.preventDefault();
    });
}

// Функція для додавання обробників кліків до елемента
function addClickHandlers(element) {
    let clickTimeout;
    
    // Обробник для подвійного кліку (видалення завдання)
    element.addEventListener("click", function(e) {
        clickTimeout = setTimeout(() => {
            // Одинарний клік - можна додати редагування в майбутньому
        }, 200);
    });
    
    element.addEventListener("dblclick", function(e) {
        clearTimeout(clickTimeout);
        e.preventDefault();
        
        // Додаємо анімацію видалення
        element.style.animation = "deleteAnimation 0.3s ease";
        element.style.opacity = "0";
        element.style.transform = "scale(0.8)";
        
        setTimeout(() => {
            element.remove();
            saveStateToFirebase(); // Зберігаємо в Firebase
            saveLocalState(); // Backup в localStorage
        }, 300);
    });
}

// Обробник для кнопки додавання завдання
addTaskBtn.addEventListener("click", function() {
    const taskText = newTaskInput.value.trim();
    if (taskText) {
        createNewTask(taskText);
        newTaskInput.value = "";
        newTaskInput.focus();
        saveStateToFirebase(); // Зберігаємо в Firebase
        saveLocalState(); // Backup в localStorage
    }
});

// Обробник для Enter в полі вводу
newTaskInput.addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
        const taskText = newTaskInput.value.trim();
        if (taskText) {
            createNewTask(taskText);
            newTaskInput.value = "";
            saveStateToFirebase(); // Зберігаємо в Firebase
            saveLocalState(); // Backup в localStorage
        }
    }
});

// =================================================================
// 2. Додавання обробників подій для ЦІЛЬОВИХ ЗОН (drop zones)
// =================================================================

// Функція для додавання обробників до drop zones
function addDropZoneHandlers(dropZone) {
    // Обробник dragover - дозволяє скидання
    dropZone.addEventListener("dragover", function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        dropZone.classList.add("drag-over");
    });

    // Обробник dragleave - видаляє візуальний ефект
    dropZone.addEventListener("dragleave", function(e) {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
    });

    // Обробник drop - обробляє скидання елемента
    dropZone.addEventListener("drop", function(e) {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        
        // Отримуємо ID елемента, який перетягується
        const data = e.dataTransfer.getData("text/plain");
        const draggableElement = document.getElementById(data);

        // Переміщуємо елемент до нового батьківського елемента
        if (draggableElement && draggableElement !== dropZone) {
            dropZone.appendChild(draggableElement);
            
            // Додаємо анімацію для плавного переміщення
            draggableElement.style.animation = "dropAnimation 0.3s ease";
            setTimeout(() => {
                draggableElement.style.animation = "";
            }, 300);
            
            saveStateToFirebase(); // Зберігаємо в Firebase
            saveLocalState(); // Backup в localStorage
        }
    });
}

// Додаємо обробники до всіх drop zones
addDropZoneHandlers(rightBlock);
addDropZoneHandlers(centerBlock);
addDropZoneHandlers(leftBlock);

// =================================================================
// 3. Додавання обробників подій для ПЕРЕТЯГУВАНИХ ЕЛЕМЕНТІВ
// =================================================================

// Проходимося по всіх існуючих елементах списку завдань
for (let list of lists) {
    
    // Перевіряємо, чи має елемент ID. Якщо ні, генеруємо унікальний ID.
    if (!list.id) {
        list.id = "task-" + Math.random().toString(36).substr(2, 9);
    }

    // Додаємо обробники до існуючих елементів
    addDragHandlers(list);
    addClickHandlers(list);
}

// =================================================================
// 4. Додаткові функції для покращення UX
// =================================================================

// Функція для очищення всіх drag-over класів
function clearDragOverClasses() {
    const dropZones = [rightBlock, centerBlock, leftBlock];
    dropZones.forEach(zone => {
        zone.classList.remove("drag-over");
    });
}

// Додаємо глобальний обробник для очищення класів
document.addEventListener("dragend", clearDragOverClasses);

// =================================================================
// 5. Ініціалізація при завантаженні сторінки
// =================================================================

document.addEventListener('DOMContentLoaded', function() {
    // Завантажуємо стан з Firebase (або локальний fallback)
    loadStateFromFirebase();
    
    // Додаємо індикатор завантаження
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'loading-indicator';
    loadingIndicator.innerHTML = '🔄 Завантаження...';
    loadingIndicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 1000;
    `;
    document.body.appendChild(loadingIndicator);
    
    // Приховуємо індикатор після завантаження
    setTimeout(() => {
        loadingIndicator.style.display = 'none';
    }, 2000);
});