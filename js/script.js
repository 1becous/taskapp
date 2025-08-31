/************************************************************
 * Multi-title Kanban — script.js (boards + FCM + safe PWA)
 ************************************************************/

/* ========== CONFIG ========== */
const CONFIG = {
  USE_REALTIME: true,
  DISALLOW_CROSS_BOARD_MOVES: true,
  USE_TRANSACTIONS: true,
  VAPID_KEY: 'BKs3Rd0EkbvRIzcYU048oMi-iWuOOJKy6G5HhCZmzp6fy_mQVbX3oYP1dJ5VEuCi58NEYW8Z9W49n3Mh8P_hx-E',
  SUBSCRIBABLE_COLUMNS: ['right', 'center'], // без "left"
  FUNCTIONS_REGION: 'europe-central2'
};

/* ===== DOM refs ===== */
const boardsContainer = document.getElementById('boards');

// task modal
const taskModal = document.getElementById('modal-task');
const taskModalClose = document.getElementById('modal-task-close');
const taskForm = document.getElementById('modal-task-form');
const taskTitleInput = document.getElementById('modal-task-title');
const taskUrlInput = document.getElementById('modal-task-url');
const taskTargetBoardInput = document.getElementById('modal-task-target-board');
const taskTargetColumnInput = document.getElementById('modal-task-target-column');

// board modals
const addBoardBtn = document.getElementById('add-board-btn');
const boardModal = document.getElementById('modal-board');
const boardModalClose = document.getElementById('modal-board-close');
const boardForm = document.getElementById('modal-board-form');
const boardNameInput = document.getElementById('modal-board-name');
const boardCancelBtn = document.getElementById('modal-board-cancel');

const renameModal = document.getElementById('modal-rename-board');
const renameClose = document.getElementById('modal-rename-board-close');
const renameForm = document.getElementById('modal-rename-board-form');
const renameNameInput = document.getElementById('rename-board-name');
const renameIdInput = document.getElementById('rename-board-id');
const renameCancelBtn = document.getElementById('rename-board-cancel');

const deleteModal = document.getElementById('modal-delete-board');
const deleteClose = document.getElementById('modal-delete-board-close');
const deleteIdInput = document.getElementById('delete-board-id');
const deleteTitleSpan = document.getElementById('delete-board-title');
const deleteCancelBtn = document.getElementById('delete-board-cancel');
const deleteConfirmBtn = document.getElementById('delete-board-confirm');

// notify modal
const notifyModal = document.getElementById('modal-notify');
const notifyClose = document.getElementById('modal-notify-close');
const notifyTryBtn = document.getElementById('notify-try');
const notifyCancel = document.getElementById('notify-cancel');
const notifyBody = document.getElementById('notify-body');

/* ===== Firebase ===== */
const BOARDS_COLL = 'boards';
const boardRef = (id) => db.collection(BOARDS_COLL).doc(id);
const functions = firebase.app().functions(CONFIG.FUNCTIONS_REGION);

/* ===== helpers ===== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const escapeHtml = (s) =>
  String(s).replace(/[&<>\"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const escapeAttr = (s) => escapeHtml(s);
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const dedupe = (a = []) => { const set = new Set(); return a.filter((t) => set.has(t.id) ? false : set.add(t.id)); };
const normCols = (d = {}) => ({
  right: Array.isArray(d.right) ? d.right : [],
  center: Array.isArray(d.center) ? d.center : [],
  left: Array.isArray(d.left) ? d.left : []
});
const removeEverywhere = (cols, id) => ({
  right: (cols.right || []).filter((t) => t.id !== id),
  center: (cols.center || []).filter((t) => t.id !== id),
  left: (cols.left || []).filter((t) => t.id !== id)
});
function showToast(html, ms = 3500) { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function isMessagingSupported() { try { return firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported(); } catch { return false; } }
function openNotifyModal(msgHtml) { if (msgHtml) notifyBody.innerHTML = msgHtml; notifyModal.style.display = 'flex'; }
function closeNotifyModal() { notifyModal.style.display = 'none'; }
notifyClose?.addEventListener('click', closeNotifyModal);
notifyCancel?.addEventListener('click', closeNotifyModal);

// короткий URL (рівно 15 символів)
function shorten(s, n = 15) { const str = (s ?? '').toString(); return str.length > n ? str.slice(0, n) + '…' : str; }

// локальний кеш підписок — гарантія від «скидання» стану
function topicKey(t) { return `topic:${t}`; }
function persistTopic(topic, subscribed) { try { localStorage.setItem(topicKey(topic), subscribed ? '1' : '0'); } catch {} }
function readTopic(topic) { try { return localStorage.getItem(topicKey(topic)) === '1'; } catch { return false; } }

/* ===== Firestore ops ===== */
async function fetchBoardsOnce() {
  const s = await db.collection(BOARDS_COLL).orderBy('createdAt', 'asc').get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
function subscribeBoards(cb) {
  return db.collection(BOARDS_COLL).orderBy('createdAt', 'asc').onSnapshot((s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
async function createBoard(name) {
  const id = newId('board');
  await boardRef(id).set({ name, right: [], center: [], left: [], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  return id;
}
async function renameBoard(id, name) { await boardRef(id).set({ name }, { merge: true }); }
async function deleteBoard(id) { await boardRef(id).delete(); }
async function saveCols(id, cols) { await boardRef(id).set(normCols(cols), { merge: true }); }

/* ===== Messaging ===== */
let messaging = null;
let pendingSubscription = null;

// ① ініціалізуємо токен одразу при старті, якщо дозвіл вже GRANTED
async function warmupMessagingIfGranted() {
  if (!isMessagingSupported()) return;
  if (Notification.permission !== 'granted') return;
  try { await ensureMessagingReady(); } catch (e) { console.warn('[FCM] warmup failed:', e); }
}

async function ensureMessagingReady() {
  if (!isMessagingSupported()) throw new Error('NOT_SUPPORTED');
  if (!CONFIG.VAPID_KEY || CONFIG.VAPID_KEY.startsWith('PASTE_')) throw new Error('NO_VAPID');
  if (!('serviceWorker' in navigator)) throw new Error('NO_SW');

  // чекаємо ВАШ service-worker з scope "./"
  const swReg = await navigator.serviceWorker.ready;

  // ініціалізуємо messaging один раз
  if (!messaging) messaging = firebase.messaging();

  // ВАЖЛИВО: змусити compat-SDK використовувати наш SW і не реєструвати дефолтний
  if (typeof messaging.useServiceWorker === 'function') {
    messaging.useServiceWorker(swReg);
  }

  // якщо дозвіл уже заблоковано — не ліземо далі
  if (Notification.permission === 'denied') {
    throw new Error('PERMISSION_DENIED');
  }

  // беремо/оновлюємо токен з КЕШЕМ
  let token = localStorage.getItem('fcmToken');
  if (!token) {
    token = await messaging.getToken({
      vapidKey: CONFIG.VAPID_KEY,
      serviceWorkerRegistration: swReg, // <- КЛЮЧОВЕ
    });
    if (!token) throw new Error('TOKEN_FAIL');
    localStorage.setItem('fcmToken', token);
  }

  // слухач повідомлень у відкритій вкладці
  if (!ensureMessagingReady._bound) {
    messaging.onMessage((payload) => {
      const n = payload?.notification || {};
      showToast(
        `<strong>${n.title || 'Нове сповіщення'}</strong><div class="small">${n.body || ''}</div>`,
        5000
      );
    });
    ensureMessagingReady._bound = true;
  }

  return token;
}

async function getMyTopics() {
  const token = localStorage.getItem('fcmToken');
  if (!token) return { token: null, topics: [] };
  const doc = await firebase.firestore().collection('subscribers').doc(token).get();
  const topics = (doc.exists && Array.isArray(doc.data().topics)) ? doc.data().topics : [];
  return { token, topics };
}

function topicFor(boardId, col) { return `board_${boardId}_${col}`.replace(/[^a-zA-Z0-9_\-]/g, '_'); }
function setBellUi(btn, sub) {
  btn.dataset.subscribed = sub ? '1' : '0';
  btn.title = sub ? 'Відписатись від сповіщень' : 'Підписатись на сповіщення';
  btn.textContent = sub ? '🔔' : '🔕';
}

// реальна дія підписки
async function doToggleSubscription(boardId, column, wantSub, btnEl) {
  btnEl.disabled = true;
  try {
    const token = await ensureMessagingReady();
    const callable = wantSub ? functions.httpsCallable('subscribeToColumn')
                             : functions.httpsCallable('unsubscribeFromColumn');
    await callable({ token, boardId, column });
    setBellUi(btnEl, wantSub);
    persistTopic(topicFor(boardId, column), wantSub);
    showToast(wantSub ? `🔔 Підписка на «${column === 'right' ? 'На редагування' : 'На тайп'}» увімкнена`
                      : '🔕 Підписку вимкнено');
  } catch (e) {
    console.error('[FCM] doToggleSubscription:', e);
    const msg = String(e.message || '');
    if (msg.includes('NO_VAPID')) openNotifyModal('<p><strong>VAPID ключ не налаштований.</strong></p><p>Додай публічний ключ у <code>CONFIG.VAPID_KEY</code>.</p>');
    else if (msg.includes('NOT_SUPPORTED')) openNotifyModal('<p>Браузер / iOS PWA не підтримує FCM. Працюватимуть лише тости у вкладці.</p>');
    else if (msg.includes('PERMISSION_DENIED')) openNotifyModal('<p>Доступ до сповіщень заблоковано. Дозволь у налаштуваннях сайту.</p>');
    else if (msg.includes('SW')) openNotifyModal('<p>Service Worker не активний або сайт не з HTTPS/localhost.</p>');
    else showToast('Не вдалося змінити підписку. Консоль підкаже деталі.', 4500);
  } finally {
    btnEl.disabled = false;
  }
}

// обгортка: якщо дозвіл не питали — показуємо модалку
async function toggleSubscription(boardId, column, wantSub, btnEl) {
  if (isMessagingSupported() && Notification.permission === 'default') {
    pendingSubscription = { boardId, column, wantSub, btnEl };
    openNotifyModal('<p>Дозвольте сповіщення, щоб підписатися на колонку.</p>');
    return;
  }
  return doToggleSubscription(boardId, column, wantSub, btnEl);
}

// кнопка у модалці
if (notifyTryBtn) {
  notifyTryBtn.onclick = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { showToast('Дозвіл не надано.', 3000); return; }
      closeNotifyModal();
      if (pendingSubscription) {
        const { boardId, column, wantSub, btnEl } = pendingSubscription;
        await doToggleSubscription(boardId, column, wantSub, btnEl);
      }
    } finally {
      pendingSubscription = null;
    }
  };
}

/* ===== Tx move (без дублю) ===== */
async function moveTx({ fromBoardId, toBoardId, taskId, taskObj, targetColumn }) {
  if (fromBoardId === toBoardId) {
    await db.runTransaction(async (tx) => {
      const ref = boardRef(fromBoardId);
      const snap = await tx.get(ref); if (!snap.exists) return;
      const data = normCols(snap.data());
      const cleaned = removeEverywhere(data, taskId);
      cleaned[targetColumn] = dedupe([...(cleaned[targetColumn] || []), taskObj]);
      tx.set(ref, cleaned, { merge: true });
    });
  } else {
    await db.runTransaction(async (tx) => {
      const A = boardRef(fromBoardId), B = boardRef(toBoardId);
      const [sa, sb] = await Promise.all([tx.get(A), tx.get(B)]); if (!sa.exists || !sb.exists) return;
      const a = removeEverywhere(normCols(sa.data()), taskId);
      const b = normCols(sb.data()); b[targetColumn] = dedupe([...(b[targetColumn] || []), taskObj]);
      tx.set(A, a, { merge: true }); tx.set(B, b, { merge: true });
    });
  }
}

/* ===== Render ===== */
function renderBoards(boards) { boardsContainer.innerHTML = ''; boards.forEach((b) => renderBoard(b)); }

function renderBoard(board) {
  const wrap = document.createElement('section');
  wrap.className = 'board'; wrap.dataset.boardId = board.id;
  wrap.innerHTML = `
    <div class="board-header">
      <h2 title="${escapeAttr(board.name || '')}">${escapeHtml(board.name || '')}</h2>
      <div class="board-actions">
        <button class="icon-btn icon-rename" title="Редагувати тайтл">✎</button>
        <button class="icon-btn icon-delete" title="Видалити тайтл">🗑️</button>
      </div>
    </div>
    <div class="block board-columns">
      ${columnHtml('right','На редагування','block_first',board.id)}
      ${columnHtml('center','На тайп','block_second',board.id)}
      ${columnHtml('left','Готово','block_third',board.id)}
    </div>`;
  boardsContainer.appendChild(wrap);

  const cols = normCols(board);
  const r = wrap.querySelector('[data-column="right"] .block_list');
  const c = wrap.querySelector('[data-column="center"] .block_list');
  const l = wrap.querySelector('[data-column="left"] .block_list');
  cols.right.forEach((t) => renderTask(t, r, board.id));
  cols.center.forEach((t) => renderTask(t, c, board.id));
  cols.left.forEach((t) => renderTask(t, l, board.id));
  [r, c, l].forEach((z) => addDropZone(z, board.id));

  wrap.querySelectorAll('.add-task-btn').forEach((b) => b.addEventListener('click', () => openTaskModal({ boardId: board.id, column: b.dataset.column })));
  wrap.querySelector('.icon-rename').addEventListener('click', () => openRenameBoardModal(board.id, board.name));
  wrap.querySelector('.icon-delete').addEventListener('click', () => openDeleteBoardModal(board.id, board.name));

  initBellsForBoard(wrap, board.id);
}

function columnHtml(key, title, extra, boardId) {
  const canSub = CONFIG.SUBSCRIBABLE_COLUMNS.includes(key);
  return `
  <div class="block_task ${extra}" data-column="${key}">
    <div class="block-header">
      <h3>${title}</h3>
      <div style="display:flex;gap:8px;align-items:center;">
        ${canSub ? `<button class="sub-btn" data-column="${key}" data-board="${boardId}" title="Підписатись на сповіщення">🔕</button>` : ''}
        <button class="add-task-btn" data-column="${key}" title="Додати завдання">+</button>
      </div>
    </div>
    <div class="block_list" data-column-list="${key}"></div>
  </div>`;
}

function renderTask(task, listEl, boardId) {
  const el = document.createElement('div');
  el.className = 'block_task-list';
  el.draggable = true;
  el.dataset.id = task.id;
  el.dataset.title = task.title;
  el.dataset.url = task.url;
  el.dataset.boardId = boardId;

  const short = shorten(task.url, 15);

  el.innerHTML = `
    <div class="task-title" draggable="false" style="user-select:none;font-weight:700;margin-bottom:6px;">${escapeHtml(task.title)}</div>
    <div class="task-url" draggable="false" style="user-select:none;">
      URL: <a href="${escapeAttr(task.url)}" target="_blank" rel="noopener" class="task-link" draggable="false" style="user-select:none;">${escapeHtml(short)}</a>
    </div>`;
  addDrag(el); addDeleteDblClick(el); listEl.appendChild(el);
}

/* ===== Bells (персистентні) ===== */
async function initBellsForBoard(wrap, boardId) {
  const btns = wrap.querySelectorAll('.sub-btn');
  if (!btns.length) return;

  if (!isMessagingSupported()) { enableForegroundFallback(boardId, wrap); return; }

  // якщо вже granted — стягнемо токен (разово на старті це робиться warmup’ом)
  await warmupMessagingIfGranted();

  let topics = [];
  try { const res = await getMyTopics(); topics = res.topics || []; }
  catch (e) { console.warn('[FCM] getMyTopics failed, using localStorage', e); }

  btns.forEach((btn) => {
    const col = btn.dataset.column;
    const topic = topicFor(boardId, col);
    const isSub = topics.includes(topic) || (!topics.length && readTopic(topic));
    setBellUi(btn, isSub);

    btn.onclick = async () => {
      if (btn.dataset.busy === '1') return;
      btn.dataset.busy = '1';
      const wantSub = btn.dataset.subscribed !== '1';
      await toggleSubscription(boardId, col, wantSub, btn);
      persistTopic(topic, btn.dataset.subscribed === '1');
      btn.dataset.busy = '0';
    };
  });
}

// простий «у вкладці» режим (для iOS/PWA або без FCM)
const fgWatchers = new Map();
function enableForegroundFallback(boardId, wrap) {
  if (fgWatchers.has(boardId)) return;
  const unsub = boardRef(boardId).onSnapshot((doc) => {
    const d = doc.data() || {}; const cols = normCols(d);
    const k = (c) => `seen_${boardId}_${c}`;
    const seenR = new Set(JSON.parse(localStorage.getItem(k('right')) || '[]'));
    const seenC = new Set(JSON.parse(localStorage.getItem(k('center')) || '[]'));
    const newR = (cols.right || []).filter((t) => !seenR.has(t.id));
    const newC = (cols.center || []).filter((t) => !seenC.has(t.id));
    if (newR.length) { const t = newR[newR.length - 1]; showToast(`<strong>Новий таск у «На редагування»</strong><div class="small">${t.title}</div>`); newR.forEach((x) => seenR.add(x.id)); localStorage.setItem(k('right'), JSON.stringify([...seenR])); }
    if (newC.length) { const t = newC[newC.length - 1]; showToast(`<strong>Новий таск у «На тайп»</strong><div class="small">${t.title}</div>`); newC.forEach((x) => seenC.add(x.id)); localStorage.setItem(k('center'), JSON.stringify([...seenC])); }
  });
  fgWatchers.set(boardId, unsub);

  wrap.querySelectorAll('.sub-btn').forEach((btn) => {
    btn.dataset.subscribed = '1'; btn.textContent = '🔔';
    btn.title = 'Сповіщення працюють у вкладці (без пушів)';
  });
}

/* ===== Modals ===== */
function showModal(el, focusEl) { el.style.display = 'flex'; if (focusEl) setTimeout(() => focusEl.focus(), 50); }
function hideModal(el) { el.style.display = 'none'; }

function openTaskModal({ boardId, column }) {
  taskTargetBoardInput.value = boardId;
  taskTargetColumnInput.value = column;
  taskTitleInput.value = '';
  taskUrlInput.value = '';
  showModal(taskModal, taskTitleInput);
}
taskModalClose.onclick = () => hideModal(taskModal);

addBoardBtn?.addEventListener('click', () => { boardNameInput.value = ''; showModal(boardModal, boardNameInput); });
boardModalClose?.addEventListener('click', () => hideModal(boardModal));
boardCancelBtn?.addEventListener('click', () => hideModal(boardModal));

function openRenameBoardModal(id, name = '') { renameIdInput.value = id; renameNameInput.value = name; showModal(renameModal, renameNameInput); renameNameInput.select(); }
renameClose?.addEventListener('click', () => hideModal(renameModal));
renameCancelBtn?.addEventListener('click', () => hideModal(renameModal));

function openDeleteBoardModal(id, name = '') { deleteIdInput.value = id; deleteTitleSpan.textContent = name; showModal(deleteModal); }
deleteClose?.addEventListener('click', () => hideModal(deleteModal));
deleteCancelBtn?.addEventListener('click', () => hideModal(deleteModal));
deleteConfirmBtn?.addEventListener('click', async () => {
  const id = deleteIdInput.value; if (!id) return; await deleteBoard(id); hideModal(deleteModal);
  if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
});

window.addEventListener('click', (e) => {
  if (e.target === taskModal) hideModal(taskModal);
  if (e.target === boardModal) hideModal(boardModal);
  if (e.target === renameModal) hideModal(renameModal);
  if (e.target === deleteModal) hideModal(deleteModal);
});

/* ===== Forms ===== */
boardForm?.addEventListener('submit', async (e) => {
  e.preventDefault(); const name = boardNameInput.value.trim(); if (!name) return;
  await createBoard(name); hideModal(boardModal);
  if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
});
renameForm?.addEventListener('submit', async (e) => {
  e.preventDefault(); const id = renameIdInput.value; const name = renameNameInput.value.trim(); if (!id || !name) return;
  await renameBoard(id, name); hideModal(renameModal);
  if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
});
taskForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = taskTitleInput.value.trim(), url = taskUrlInput.value.trim();
  const boardId = taskTargetBoardInput.value, column = taskTargetColumnInput.value;
  if (!title || !url || !boardId || !column) return;
  const id = newId('task'); const t = { id, title, url, createdAt: Date.now() };
  await db.runTransaction(async (tx) => {
    const ref = boardRef(boardId), snap = await tx.get(ref); if (!snap.exists) return;
    const cols = normCols(snap.data());
    cols[column] = dedupe([...(cols[column] || []), t]);
    tx.set(ref, cols, { merge: true });
  });
  hideModal(taskModal);
  if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
});

/* ===== Drag&Drop ===== */
function addDrag(el) {
  el.addEventListener('dragstart', (e) => {
    const source = el.closest('[data-column]')?.getAttribute('data-column');
    e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: el.dataset.id, boardId: el.dataset.boardId, title: el.dataset.title, url: el.dataset.url, sourceColumn: source }));
    e.dataTransfer.effectAllowed = 'move'; el.classList.add('is-dragging'); setTimeout(() => { el.style.opacity = '0.5'; }, 0);
  });
  el.addEventListener('dragend', () => { el.classList.remove('is-dragging'); el.style.opacity = '1'; });
}
function addDropZone(zone, targetBoardId) {
  zone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', (e) => { e.preventDefault(); zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', async (e) => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const payload = safeJson(e.dataTransfer.getData('text/plain')); if (!payload) return;
    const targetCol = zone.closest('[data-column]')?.getAttribute('data-column'); if (!targetCol) return;
    const { taskId, boardId: fromId, title, url, sourceColumn } = payload;
    if (sourceColumn === targetCol && fromId === targetBoardId) return;
    if (CONFIG.DISALLOW_CROSS_BOARD_MOVES && fromId !== targetBoardId) return;
    await moveTx({ fromBoardId: fromId, toBoardId: targetBoardId, taskId, taskObj: { id: taskId, title, url }, targetColumn: targetCol });
    if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
  });
}

/* ===== Delete card dblclick ===== */
function addDeleteDblClick(el) {
  el.addEventListener('dblclick', async (e) => {
    e.preventDefault(); el.style.animation = 'deleteAnimation .3s ease'; el.style.opacity = '0'; el.style.transform = 'scale(.8)'; await sleep(300);
    const bId = el.dataset.boardId, tId = el.dataset.id;
    await db.runTransaction(async (tx) => {
      const ref = boardRef(bId), snap = await tx.get(ref); if (!snap.exists) return;
      const cols = removeEverywhere(normCols(snap.data()), tId); tx.set(ref, cols, { merge: true });
    });
    if (!CONFIG.USE_REALTIME) renderBoards(await fetchBoardsOnce());
  });
}

/* ===== Bootstrap ===== */
document.addEventListener('DOMContentLoaded', async () => {
  const loader = document.createElement('div'); loader.id = 'loading-indicator'; loader.innerHTML = '🔄 Завантаження...';
  loader.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.8);color:#fff;padding:20px;border-radius:10px;z-index:1000;';
  document.body.appendChild(loader);

  // GRANTED -> одразу готуємо FCM (щоб після перезавантаження стан підписок не «плавав»)
  await warmupMessagingIfGranted();

  if (CONFIG.USE_REALTIME) {
    subscribeBoards((boards) => { renderBoards(boards); loader.style.display = 'none'; });
  } else {
    renderBoards(await fetchBoardsOnce()); setTimeout(() => loader.style.display = 'none', 400);
  }
});
