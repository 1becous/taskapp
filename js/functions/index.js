// functions/index.js  (Node 20)
// npm i firebase-functions@^5 firebase-admin@^12

const { setGlobalOptions } = require('firebase-functions/v2');
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();

// ====== Глобальні опції (ВАШ РЕГІОН) ======
setGlobalOptions({
  region: 'europe-central2',
  maxInstances: 10,
});

const ALLOWED_COLUMNS = new Set(['right', 'center']); // без "left" (Готово)
const NOTIFY_ON_MOVES = true;

// Готуємо безпечний topic
function topicFor(boardId, column) {
  // тільки букви/цифри/підкреслення/дефіс
  return `board_${boardId}_${column}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ====== onCall: subscribe ======
exports.subscribeToColumn = onCall(async (request) => {
  const { token, boardId, column } = request.data || {};
  if (!token || !boardId || !ALLOWED_COLUMNS.has(column)) {
    throw new Error('invalid-argument');
  }

  const topic = topicFor(boardId, column);
  await admin.messaging().subscribeToTopic([token], topic);

  await admin.firestore().collection('subscribers').doc(token).set({
    topics: admin.firestore.FieldValue.arrayUnion(topic),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, topic };
});

// ====== onCall: unsubscribe ======
exports.unsubscribeFromColumn = onCall(async (request) => {
  const { token, boardId, column } = request.data || {};
  if (!token || !boardId || !ALLOWED_COLUMNS.has(column)) {
    throw new Error('invalid-argument');
  }

  const topic = topicFor(boardId, column);
  await admin.messaging().unsubscribeFromTopic([token], topic);

  await admin.firestore().collection('subscribers').doc(token).set({
    topics: admin.firestore.FieldValue.arrayRemove(topic),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, topic };
});

// ====== Firestore trigger: пуші на нові/переміщені таски ======
exports.notifyOnNewTasks = onDocumentWritten('boards/{boardId}', async (event) => {
  const boardId = event.params.boardId;

  const before = event.data.before.exists ? event.data.before.data() : null;
  const after  = event.data.after.exists  ? event.data.after.data()  : null;
  if (!after) return;

  const boardName = after.name || 'Тайтл';

  const arr = (x) => (Array.isArray(x) ? x : []);
  const beforeRight  = new Set(arr(before?.right).map(t => t.id));
  const beforeCenter = new Set(arr(before?.center).map(t => t.id));
  const allBeforeIds = new Set([
    ...arr(before?.right).map(t => t.id),
    ...arr(before?.center).map(t => t.id),
    ...arr(before?.left).map(t => t.id),
  ]);

  const events = [];

  // right
  if (ALLOWED_COLUMNS.has('right')) {
    for (const t of arr(after.right)) {
      const wasInRight   = beforeRight.has(t.id);
      const isNewToBoard = !allBeforeIds.has(t.id);
      if (!wasInRight && (NOTIFY_ON_MOVES || isNewToBoard)) {
        events.push({ column: 'right', task: t });
      }
    }
  }

  // center
  if (ALLOWED_COLUMNS.has('center')) {
    for (const t of arr(after.center)) {
      const wasInCenter  = beforeCenter.has(t.id);
      const isNewToBoard = !allBeforeIds.has(t.id);
      if (!wasInCenter && (NOTIFY_ON_MOVES || isNewToBoard)) {
        events.push({ column: 'center', task: t });
      }
    }
  }

  if (!events.length) return;

  // формуємо webpush без іконки (SW покаже свою іконку)
  const messages = events.map(({ column, task }) => {
    const titleUA = column === 'right'
      ? 'Новий таск у «На редагування»'
      : 'Новий таск у «На тайп»';
    const topic = topicFor(boardId, column);

    return {
      topic,
      webpush: {
        notification: {
          title: `${titleUA} — ${boardName}`,
          body: task?.title || 'Перегляньте деталі',
          // іконку навмисно не ставимо — інакше на GitHub Pages легко отримати 404.
        },
        fcmOptions: {
          link: task?.url || '/',
        },
      },
    };
  });

  await admin.messaging().sendAll(messages);
});
