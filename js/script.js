// ======= DOM Elements =======
const rightBlock = document.getElementById("right");
const centerBlock = document.getElementById("center");
const leftBlock = document.getElementById("left");

const modal = document.getElementById('modal-task');
const modalClose = document.getElementById('modal-task-close');
const modalForm = document.getElementById('modal-task-form');
const modalTitle = document.getElementById('modal-task-title');
const modalUrl = document.getElementById('modal-task-url');
const modalTargetBlock = document.getElementById('modal-task-target-block');

// ======= Modal Logic =======
document.querySelectorAll('.add-task-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        modal.style.display = 'flex';
        modalTitle.value = '';
        modalUrl.value = '';
        modalTargetBlock.value = btn.dataset.block;
        setTimeout(() => modalTitle.focus(), 100);
    });
});
modalClose.onclick = function() { modal.style.display = 'none'; };
window.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };

// ======= Firestore Helpers =======
const TASKS_DOC = 'main';
const TASKS_COLL = 'tasks';

async function getStateFromFirebase() {
    const doc = await db.collection(TASKS_COLL).doc(TASKS_DOC).get();
    if (doc.exists) return doc.data();
    return { right: [], center: [], left: [] };
}
async function setStateToFirebase(state) {
    await db.collection(TASKS_COLL).doc(TASKS_DOC).set(state);
}

// ======= Render Logic =======
function renderAll(state) {
    rightBlock.innerHTML = '';
    centerBlock.innerHTML = '';
    leftBlock.innerHTML = '';
    (state.right || []).forEach(task => renderTask(task, rightBlock));
    (state.center || []).forEach(task => renderTask(task, centerBlock));
    (state.left || []).forEach(task => renderTask(task, leftBlock));
}
function renderTask(task, block) {
    const el = document.createElement('div');
    el.className = 'block_task-list';
    el.draggable = true;
    el.dataset.title = task.title;
    el.dataset.url = task.url;
    el.dataset.id = task.id;
    el.id = task.id;
    const shortUrl = task.url.length > 20 ? task.url.slice(0, 20) + '...' : task.url;
    el.innerHTML = `
        <div class="task-title" draggable="false" style="user-select:none;">${task.title}</div>
        <div class="task-url" draggable="false" style="user-select:none;">URL: <a href="${task.url}" target="_blank" rel="noopener" class="task-link" draggable="false" style="user-select:none;">${shortUrl}</a></div>
    `;
    addDragHandlers(el);
    addClickHandlers(el);
    block.appendChild(el);
}

// ======= Add Task =======
modalForm.onsubmit = async function(e) {
    e.preventDefault();
    const title = modalTitle.value.trim();
    const url = modalUrl.value.trim();
    const blockId = modalTargetBlock.value;
    if (!title || !url) return;
    const id = 'task-' + Date.now() + '-' + Math.floor(Math.random()*1000);
    const newTask = { id, title, url };
    let state = await getStateFromFirebase();
    if (!state[blockId]) state[blockId] = [];
    state[blockId].push(newTask);
    await setStateToFirebase(state);
    renderAll(state);
    modal.style.display = 'none';
};

// ======= Drag & Drop =======
[rightBlock, centerBlock, leftBlock].forEach(block => addDropZoneHandlers(block));

function addDragHandlers(element) {
    element.draggable = true;
    element.addEventListener("dragstart", function(e) {
        e.dataTransfer.setData("text/plain", e.currentTarget.id);
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add("is-dragging");
        setTimeout(() => { e.currentTarget.style.opacity = "0.5"; }, 0);
    });
    element.addEventListener("dragend", function(e) {
        e.currentTarget.classList.remove("is-dragging");
        e.currentTarget.style.opacity = "1";
    });
    element.addEventListener("dragenter", function(e) { e.preventDefault(); });
    element.addEventListener("dragover", function(e) { e.preventDefault(); });
}
function addDropZoneHandlers(dropZone) {
    dropZone.addEventListener("dragover", function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", function(e) {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
    });
    dropZone.addEventListener("drop", async function(e) {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        let data = e.dataTransfer.getData("text/plain");
        let draggableElement = document.getElementById(data);
        if (draggableElement && draggableElement !== dropZone) {
            // Оновлюємо стан у Firebase
            let state = await getStateFromFirebase();
            // Видаляємо з усіх блоків
            ['right','center','left'].forEach(block => {
                state[block] = (state[block]||[]).filter(task => task.id !== draggableElement.id);
            });
            // Додаємо у новий блок
            const newTask = {
                id: draggableElement.id,
                title: draggableElement.dataset.title || '',
                url: draggableElement.dataset.url || ''
            };
            if (!state[dropZone.id]) state[dropZone.id] = [];
            state[dropZone.id].push(newTask);
            await setStateToFirebase(state);
            renderAll(state);
        }
    });
}

// ======= Double Click Delete =======
function addClickHandlers(element) {
    let clickTimeout;
    element.addEventListener("click", function(e) {
        clickTimeout = setTimeout(() => {}, 200);
    });
    element.addEventListener("dblclick", async function(e) {
        clearTimeout(clickTimeout);
        e.preventDefault();
        element.style.animation = "deleteAnimation 0.3s ease";
        element.style.opacity = "0";
        element.style.transform = "scale(0.8)";
        setTimeout(async () => {
            // Видаляємо з UI і з Firebase
            let state = await getStateFromFirebase();
            ['right','center','left'].forEach(block => {
                state[block] = (state[block]||[]).filter(task => task.id !== element.id);
            });
            await setStateToFirebase(state);
            renderAll(state);
        }, 300);
    });
}

// ======= Load on Start =======
document.addEventListener('DOMContentLoaded', async function() {
    // Loader (optional)
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
    // Завантажуємо з Firebase
    const state = await getStateFromFirebase();
    renderAll(state);
    setTimeout(() => { loadingIndicator.style.display = 'none'; }, 500);
});
