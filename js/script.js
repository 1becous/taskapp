/************************************************************
 * Multi-title Kanban — script.js (with FCM subscriptions)
 * Firebase compat SDK (app + firestore + messaging + functions)
 ************************************************************/

/* ========== CONFIG ========== */
const CONFIG = {
  USE_REALTIME: true,
  DISALLOW_CROSS_BOARD_MOVES: true,
  USE_TRANSACTIONS: true,
  // Встав свій VAPID ключ (Firebase console → Cloud Messaging → Web Push certs)
  VAPID_KEY: 'BKs3Rd0EkbvRIzcYU048oMi-iWuOOJKy6G5HhCZmzp6fy_mQVbX3oYP1dJ5VEuCi58NEYW8Z9W49n3Mh8P_hx-E',
  SUBSCRIBABLE_COLUMNS: ['right','center'] // "left" (Готово) виключено
};

/* ========== DOM (як у тебе) ========== */
const boardsContainer = document.getElementById('boards');

// Task modal
const taskModal = document.getElementById('modal-task');
const taskModalClose = document.getElementById('modal-task-close');
const taskForm = document.getElementById('modal-task-form');
const taskTitleInput = document.getElementById('modal-task-title');
const taskUrlInput = document.getElementById('modal-task-url');
const taskTargetBoardInput = document.getElementById('modal-task-target-board');
const taskTargetColumnInput = document.getElementById('modal-task-target-column');

// Add board modal (красиві модалки — з попереднього кроку)
const addBoardBtn = document.getElementById('add-board-btn');
const boardModal = document.getElementById('modal-board');
const boardModalClose = document.getElementById('modal-board-close');
const boardForm = document.getElementById('modal-board-form');
const boardNameInput = document.getElementById('modal-board-name');
const boardCancelBtn = document.getElementById('modal-board-cancel');

// Rename modal
const renameModal = document.getElementById('modal-rename-board');
const renameClose = document.getElementById('modal-rename-board-close');
const renameForm = document.getElementById('modal-rename-board-form');
const renameNameInput = document.getElementById('rename-board-name');
const renameIdInput = document.getElementById('rename-board-id');
const renameCancelBtn = document.getElementById('rename-board-cancel');

// Delete modal
const deleteModal = document.getElementById('modal-delete-board');
const deleteClose = document.getElementById('modal-delete-board-close');
const deleteIdInput = document.getElementById('delete-board-id');
const deleteTitleSpan = document.getElementById('delete-board-title');
const deleteCancelBtn = document.getElementById('delete-board-cancel');
const deleteConfirmBtn = document.getElementById('delete-board-confirm');

/* ========== Firebase refs ========== */
const BOARDS_COLL = 'boards';
const boardRef = (id) => db.collection(BOARDS_COLL).doc(id);
const functions = firebase.functions();
let messaging = null;

/* ========== Helpers ========== */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const newId = (p) => `${p}-${Date.now()}-${Math.floor(Math.random()*1000)}`;
const escapeHtml = (s) => String(s).replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const escapeAttr = (s) => escapeHtml(s);
const safeJsonParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const dedupe = (arr=[]) => { const seen = new Set(); return arr.filter(t => (seen.has(t.id)?false:seen.add(t.id))); };
const normalizeCols = (d={}) => ({ right:Array.isArray(d.right)?d.right:[], center:Array.isArray(d.center)?d.center:[], left:Array.isArray(d.left)?d.left:[] });
const removeTaskEverywhere = (cols, id) => ({ right:(cols.right||[]).filter(t=>t.id!==id), center:(cols.center||[]).filter(t=>t.id!==id), left:(cols.left||[]).filter(t=>t.id!==id) });
const topicFor = (boardId, column) => `board_${boardId}_${column}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');

/* ========== Messaging (FCM) ========== */
async function ensureMessagingReady() {
  if (!messaging) messaging = firebase.messaging();

  // SW реєструвати не обов'язково вручну, але корисно прогріти:
  try { await navigator.serviceWorker.register('/firebase-messaging-sw.js'); } catch {}

  // Запит дозволу
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission not granted');

  // Отримати/кешувати токен
  let token = localStorage.getItem('fcmToken');
  if (!token) {
    token = await messaging.getToken({ vapidKey: CONFIG.VAPID_KEY, serviceWorkerRegistration: await navigator.serviceWorker.ready });
    if (!token) throw new Error('FCM token not available');
    localStorage.setItem('fcmToken', token);
  }

  // Фронтовий onMessage (foreground)
  messaging.onMessage((payload) => {
    // Опціонально показати тост/банер
    console.debug('[FCM] onMessage', payload);
  });

  return token;
}

async function getMyTopics() {
  const token = localStorage.getItem('fcmToken');
  if (!token) return { token: null, topics: [] };
  const doc = await firebase.firestore().collection('subscribers').doc(token).get();
  const topics = (doc.exists && Array.isArray(doc.data().topics)) ? doc.data().topics : [];
  return { token, topics };
}

async function toggleSubscription(boardId, column, wantSub, btnEl) {
  const token = await ensureMessagingReady();
  const callable = wantSub ? functions.httpsCallable('subscribeToColumn')
                           : functions.httpsCallable('unsubscribeFromColumn');
  await callable({ token, boardId, column });
  // Відобразити стан
  setBellUi(btnEl, wantSub);
}

function setBellUi(btnEl, subscribed) {
  btnEl.dataset.subscribed = subscribed ? '1' : '0';
  btnEl.title = subscribed ? 'Відписатись від сповіщень' : 'Підписатись на сповіщення';
  btnEl.textContent = subscribed ? '🔔' : '🔕';
}

/* ========== Firestore ops ========== */
async function fetchBoardsOnce() {
  const snap = await db.collection(BOARDS_COLL).orderBy('createdAt','asc').get();
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
function subscribeBoards(cb) {
  return db.collection(BOARDS_COLL).orderBy('createdAt','asc').onSnapshot(snap => {
    cb(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  });
}
async function getBoard(id) { const doc = await boardRef(id).get(); return doc.exists ? ({ id:doc.id, ...doc.data() }) : null; }
async function createBoard(name) {
  const id = newId('board');
  await boardRef(id).set({ name, right:[], center:[], left:[], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  return id;
}
async function renameBoard(boardId, newName) { await boardRef(boardId).set({ name:newName }, { merge:true }); }
async function deleteBoard(boardId) { await boardRef(boardId).delete(); }
async function saveBoardColumns(boardId, cols) { await boardRef(boardId).set(normalizeCols(cols), { merge:true }); }

/* ========== Tx moves ========== */
async function moveTaskTransactional({ fromBoardId, toBoardId, taskId, taskObj, targetColumn }) {
  if (fromBoardId === toBoardId) {
    await db.runTransaction(async tx => {
      const ref = boardRef(fromBoardId);
      const snap = await tx.get(ref); if (!snap.exists) return;
      const data = normalizeCols(snap.data());
      const cleaned = removeTaskEverywhere(data, taskId);
      cleaned[targetColumn] = dedupe([...(cleaned[targetColumn]||[]), taskObj]);
      tx.set(ref, cleaned, { merge:true });
    });
  } else {
    await db.runTransaction(async tx => {
      const fromRef = boardRef(fromBoardId), toRef = boardRef(toBoardId);
      const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
      if (!fromSnap.exists || !toSnap.exists) return;
      const cleanedSource = removeTaskEverywhere(normalizeCols(fromSnap.data()), taskId);
      const targetCols = normalizeCols(toSnap.data());
      targetCols[targetColumn] = dedupe([...(targetCols[targetColumn]||[]), taskObj]);
      tx.set(fromRef, cleanedSource, { merge:true });
      tx.set(toRef, targetCols, { merge:true });
    });
  }
}

/* ========== Render ========== */
function renderBoards(boards) {
  boardsContainer.innerHTML = '';
  boards.forEach(b => renderBoard(b));
}

function renderBoard(board) {
  const wrapper = document.createElement('section');
  wrapper.className = 'board';
  wrapper.dataset.boardId = board.id;
  wrapper.innerHTML = `
    <div class="board-header">
      <h2 title="${escapeAttr(board.name||'')}">${escapeHtml(board.name||'')}</h2>
      <div class="board-actions">
        <button class="icon-btn icon-rename" title="Редагувати тайтл" aria-label="Редагувати тайтл">✎</button>
        <button class="icon-btn icon-delete" title="Видалити тайтл" aria-label="Видалити тайтл">🗑️</button>
      </div>
    </div>
    <div class="block board-columns">
      ${renderColumnHtml('right','На редагування','block_first', board.id)}
      ${renderColumnHtml('center','На тайп','block_second', board.id)}
      ${renderColumnHtml('left','Готово','block_third', board.id)}
    </div>
  `;
  boardsContainer.appendChild(wrapper);

  const cols = normalizeCols(board);
  const rightEl  = wrapper.querySelector('[data-column="right"]  .block_list');
  const centerEl = wrapper.querySelector('[data-column="center"] .block_list');
  const leftEl   = wrapper.querySelector('[data-column="left"]   .block_list');

  cols.right.forEach(t  => renderTask(t, rightEl,  board.id));
  cols.center.forEach(t => renderTask(t, centerEl, board.id));
  cols.left.forEach(t   => renderTask(t, leftEl,   board.id));

  [rightEl,centerEl,leftEl].forEach(zone => addDropZoneHandlers(zone, board.id));

  // add-task (+)
  wrapper.querySelectorAll('.add-task-btn').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal({ boardId: board.id, column: btn.dataset.column }));
  });

  // rename/delete
  wrapper.querySelector('.icon-rename').addEventListener('click', () => openRenameBoardModal(board.id, board.name));
  wrapper.querySelector('.icon-delete').addEventListener('click', () => openDeleteBoardModal(board.id, board.name));

  // Ініціалізація стану дзвоників для цього борду
  initBellsForBoard(wrapper, board.id);
}

function renderColumnHtml(key, title, extra='', boardId) {
  // Для "Готово" не додаємо кнопку підписки
  const canSubscribe = CONFIG.SUBSCRIBABLE_COLUMNS.includes(key);
  return `
    <div class="block_task ${extra}" data-column="${key}">
      <div class="block-header">
        <h3>${title}</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          ${canSubscribe ? `<button class="sub-btn" data-column="${key}" data-board="${boardId}" title="Підписатись на сповіщення">🔕</button>` : ''}
          <button class="add-task-btn" data-column="${key}" title="Додати завдання">+</button>
        </div>
      </div>
      <div class="block_list" data-column-list="${key}"></div>
    </div>
  `;
}

function renderTask(task, listEl, boardId) {
  const el = document.createElement('div');
  el.className = 'block_task-list';
  el.draggable = true;
  el.dataset.id = task.id;
  el.dataset.title = task.title;
  el.dataset.url = task.url;
  el.dataset.boardId = boardId;

  const shortUrl = task.url.length > 60 ? task.url.slice(0,60) + '…' : task.url;
  el.innerHTML = `
    <div class="task-title" draggable="false" style="user-select:none;font-weight:700;margin-bottom:6px;">${escapeHtml(task.title)}</div>
    <div class="task-url" draggable="false" style="user-select:none;">
      URL: <a href="${escapeAttr(task.url)}" target="_blank" rel="noopener" class="task-link" draggable="false" style="user-select:none;">${escapeHtml(shortUrl)}</a>
    </div>
  `;
  addDragHandlers(el);
  addClickHandlers(el);
  listEl.appendChild(el);
}

/* ===== Bells: init + click ===== */
async function initBellsForBoard(wrapper, boardId) {
  try {
    const { token, topics } = await getMyTopics();
    if (!token) return; // користувач ще не давав дозволу
    const btns = wrapper.querySelectorAll('.sub-btn');
    btns.forEach(btn => {
      const col = btn.dataset.column;
      const topic = topicFor(boardId, col);
      const isSub = topics.includes(topic);
      setBellUi(btn, isSub);
      btn.onclick = async () => {
        const want = btn.dataset.subscribed !== '1';
        btn.disabled = true;
        try { await toggleSubscription(boardId, col, want, btn); }
        finally { btn.disabled = false; }
      };
    });
  } catch (e) {
    // Без дозволу — показуємо 🔕 і відкладаємо до кліку
    wrapper.querySelectorAll('.sub-btn').forEach(btn => {
      setBellUi(btn, false);
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          // перший клік — запросити дозвіл і підписатися
          await toggleSubscription(boardId, btn.dataset.column, true, btn);
        } finally { btn.disabled = false; }
      };
    });
  }
}

/* ========== Modals (коротко) ========== */
function hideModal(el) { el.style.display = 'none'; }
function showModal(el, focusEl) { el.style.display = 'flex'; if (focusEl) setTimeout(()=>focusEl.focus(), 50); }

function openCreateBoardModal() { boardNameInput.value=''; showModal(boardModal, boardNameInput); }
addBoardBtn.addEventListener('click', openCreateBoardModal);
boardModalClose.onclick = () => hideModal(boardModal);
boardCancelBtn.onclick = () => hideModal(boardModal);

function openRenameBoardModal(id, name='') { renameIdInput.value=id; renameNameInput.value=name; showModal(renameModal, renameNameInput); renameNameInput.select(); }
renameClose.onclick = () => hideModal(renameModal);
renameCancelBtn.onclick = () => hideModal(renameModal);

function openDeleteBoardModal(id, name='') { deleteIdInput.value=id; deleteTitleSpan.textContent=name; showModal(deleteModal); }
deleteClose.onclick = () => hideModal(deleteModal);
deleteCancelBtn.onclick = () => hideModal(deleteModal);
deleteConfirmBtn.onclick = async () => {
  const id = deleteIdInput.value; if (!id) return;
  await deleteBoard(id);
  hideModal(deleteModal);
  if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
};

window.addEventListener('click', (e) => {
  if (e.target === taskModal) hideModal(taskModal);
  if (e.target === boardModal) hideModal(boardModal);
  if (e.target === renameModal) hideModal(renameModal);
  if (e.target === deleteModal) hideModal(deleteModal);
});

/* ========== Forms ========== */
boardForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = boardNameInput.value.trim(); if (!name) return;
  await createBoard(name);
  hideModal(boardModal);
  if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
});

renameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = renameIdInput.value; const name = renameNameInput.value.trim();
  if (!id || !name) return;
  await renameBoard(id, name);
  hideModal(renameModal);
  if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
});

function openTaskModal({ boardId, column }) {
  taskTargetBoardInput.value = boardId;
  taskTargetColumnInput.value = column;
  taskTitleInput.value = '';
  taskUrlInput.value = '';
  showModal(taskModal, taskTitleInput);
}
taskModalClose.onclick = () => hideModal(taskModal);

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = taskTitleInput.value.trim();
  const url = taskUrlInput.value.trim();
  const boardId = taskTargetBoardInput.value;
  const column = taskTargetColumnInput.value;
  if (!title || !url || !boardId || !column) return;

  const id = newId('task');
  const newTask = { id, title, url, createdAt: Date.now() };

  if (CONFIG.USE_TRANSACTIONS) {
    await db.runTransaction(async tx => {
      const ref = boardRef(boardId);
      const snap = await tx.get(ref); if (!snap.exists) return;
      const data = normalizeCols(snap.data());
      const cols = normalizeCols(data);
      cols[column] = dedupe([...(cols[column]||[]), newTask]);
      tx.set(ref, cols, { merge:true });
    });
  } else {
    const b = await getBoard(boardId); if (!b) return;
    const cols = normalizeCols(b);
    cols[column] = dedupe([...(cols[column]||[]), newTask]);
    await saveBoardColumns(boardId, cols);
  }

  hideModal(taskModal);
  if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
});

/* ========== Drag & Drop ========== */
function addDragHandlers(cardEl) {
  cardEl.addEventListener('dragstart', (e) => {
    const sourceColumn = cardEl.closest('[data-column]')?.getAttribute('data-column');
    const payload = JSON.stringify({
      taskId: cardEl.dataset.id,
      boardId: cardEl.dataset.boardId,
      title: cardEl.dataset.title,
      url: cardEl.dataset.url,
      sourceColumn
    });
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'move';
    cardEl.classList.add('is-dragging');
    setTimeout(()=>{ cardEl.style.opacity='0.5'; },0);
  });
  cardEl.addEventListener('dragend', () => {
    cardEl.classList.remove('is-dragging');
    cardEl.style.opacity = '1';
  });
}
function addDropZoneHandlers(dropZoneEl, targetBoardId) {
  dropZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault(); e.dataTransfer.dropEffect='move'; dropZoneEl.classList.add('drag-over');
  });
  dropZoneEl.addEventListener('dragleave', (e) => { e.preventDefault(); dropZoneEl.classList.remove('drag-over'); });
  dropZoneEl.addEventListener('drop', async (e) => {
    e.preventDefault(); dropZoneEl.classList.remove('drag-over');
    const payload = safeJsonParse(e.dataTransfer.getData('text/plain')); if (!payload) return;
    const targetColumn = dropZoneEl.closest('[data-column]')?.getAttribute('data-column'); if (!targetColumn) return;
    const { taskId, boardId: fromBoardId, title, url, sourceColumn } = payload;
    if (sourceColumn && sourceColumn === targetColumn && fromBoardId === targetBoardId) return;
    if (CONFIG.DISALLOW_CROSS_BOARD_MOVES && fromBoardId !== targetBoardId) return;

    const taskObj = { id: taskId, title, url };
    if (CONFIG.USE_TRANSACTIONS) {
      await moveTaskTransactional({ fromBoardId, toBoardId: targetBoardId, taskId, taskObj, targetColumn });
    } else {
      if (fromBoardId === targetBoardId) {
        const b = await getBoard(fromBoardId); if (!b) return;
        const data = normalizeCols(b);
        const cleaned = removeTaskEverywhere(data, taskId);
        cleaned[targetColumn] = dedupe([...(cleaned[targetColumn]||[]), taskObj]);
        await saveBoardColumns(fromBoardId, cleaned);
      } else {
        const [fromB, toB] = await Promise.all([getBoard(fromBoardId), getBoard(targetBoardId)]);
        if (!fromB || !toB) return;
        const cleanedSource = removeTaskEverywhere(normalizeCols(fromB), taskId);
        const targetCols = normalizeCols(toB);
        targetCols[targetColumn] = dedupe([...(targetCols[targetColumn]||[]), taskObj]);
        await Promise.all([
          saveBoardColumns(fromBoardId, cleanedSource),
          saveBoardColumns(targetBoardId, targetCols)
        ]);
      }
    }
    if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
  });
}

/* ========== Delete on double-click (card) ========== */
function addClickHandlers(cardEl) {
  cardEl.addEventListener('dblclick', async (e) => {
    e.preventDefault();
    cardEl.style.animation = 'deleteAnimation 0.3s ease';
    cardEl.style.opacity = '0';
    cardEl.style.transform = 'scale(0.8)';
    await sleep(300);

    const bId = cardEl.dataset.boardId, tId = cardEl.dataset.id;
    if (CONFIG.USE_TRANSACTIONS) {
      await db.runTransaction(async tx => {
        const ref = boardRef(bId);
        const snap = await tx.get(ref); if (!snap.exists) return;
        const data = normalizeCols(snap.data());
        const cols = removeTaskEverywhere(data, tId);
        tx.set(ref, cols, { merge:true });
      });
    } else {
      const b = await getBoard(bId); if (!b) return;
      const cols = removeTaskEverywhere(normalizeCols(b), tId);
      await saveBoardColumns(bId, cols);
    }
    if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
  });
}

/* ========== Bootstrap ========== */
let unsubscribeBoards = null;
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.createElement('div');
  loading.id = 'loading-indicator';
  loading.innerHTML = '🔄 Завантаження...';
  loading.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.8);color:#fff;padding:20px;border-radius:10px;z-index:1000;`;
  document.body.appendChild(loading);

  if (CONFIG.USE_REALTIME) {
    unsubscribeBoards = subscribeBoards((boards) => {
      renderBoards(boards);
      loading.style.display = 'none';
    });
  } else {
    renderBoards(await fetchBoardsOnce());
    setTimeout(()=>{ loading.style.display='none'; }, 400);
  }
});
