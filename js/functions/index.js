// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const ALLOWED_COLUMNS = new Set(['right','center']);     // 'left' ("Готово") не сповіщаємо
const NOTIFY_ON_MOVES = true; // true = також при переносі між колонками, false = лише коли з'явився новий id у дошці

function topicFor(boardId, column) {
  return `board_${boardId}_${column}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
}

// ===== Callable: subscribe =====
exports.subscribeToColumn = functions.https.onCall(async (data, context) => {
  const { token, boardId, column } = data || {};
  if (!token || !boardId || !ALLOWED_COLUMNS.has(column)) {
    throw new functions.https.HttpsError('invalid-argument', 'Bad args');
  }
  const topic = topicFor(boardId, column);
  await admin.messaging().subscribeToTopic([token], topic);

  await admin.firestore().collection('subscribers').doc(token).set({
    topics: admin.firestore.FieldValue.arrayUnion(topic),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true, topic };
});

// ===== Callable: unsubscribe =====
exports.unsubscribeFromColumn = functions.https.onCall(async (data, context) => {
  const { token, boardId, column } = data || {};
  if (!token || !boardId || !ALLOWED_COLUMNS.has(column)) {
    throw new functions.https.HttpsError('invalid-argument', 'Bad args');
  }
  const topic = topicFor(boardId, column);
  await admin.messaging().unsubscribeFromTopic([token], topic);

  await admin.firestore().collection('subscribers').doc(token).set({
    topics: admin.firestore.FieldValue.arrayRemove(topic),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true, topic };
});

// ===== Trigger: push on new tasks (boards/{boardId} updated) =====
exports.notifyOnNewTasks = functions.firestore
  .document('boards/{boardId}')
  .onWrite(async (change, context) => {
    const boardId = context.params.boardId;
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    if (!after) return;

    const boardName = after.name || 'Новий тайтл';

    // Допоміжні: список id по колонці
    const ids = (col = []) => new Set((Array.isArray(col) ? col : []).map(t => t.id));

    const prevAll = new Set([
      ...(ids(before?.right) || []),
      ...(ids(before?.center) || []),
      ...(ids(before?.left) || [])
    ]);

    const tasksById = (col=[]) => {
      const map = new Map();
      for (const t of (Array.isArray(col) ? col : [])) map.set(t.id, t);
      return map;
    };

    const rightMap = tasksById(after.right);
    const centerMap = tasksById(after.center);

    const events = [];

    // RIGHT
    if (ALLOWED_COLUMNS.has('right')) {
      const addRight = [...rightMap.keys()].filter(id => !(before && ids(before.right).has(id)));
      for (const id of addRight) {
        const isNewToBoard = !prevAll.has(id);
        if (NOTIFY_ON_MOVES || isNewToBoard) {
          events.push({ column: 'right', task: rightMap.get(id) });
        }
      }
    }
    // CENTER
    if (ALLOWED_COLUMNS.has('center')) {
      const addCenter = [...centerMap.keys()].filter(id => !(before && ids(before.center).has(id)));
      for (const id of addCenter) {
        const isNewToBoard = !prevAll.has(id);
        if (NOTIFY_ON_MOVES || isNewToBoard) {
          events.push({ column: 'center', task: centerMap.get(id) });
        }
      }
    }

    // Відправляємо 1 повідомлення на кожен новий таск
    const sendPromises = events.map(({ column, task }) => {
      const titleUA = column === 'right' ? 'Новий таск у «На редагування»'
                                         : 'Новий таск у «На тайп»';
      const topic = topicFor(boardId, column);
      const url = task?.url || '/';

      const message = {
        topic,
        webpush: {
          notification: {
            title: `${titleUA} — ${boardName}`,
            body: task?.title || 'Перегляньте деталі',
            icon: '/icons/192.png'
          },
          fcmOptions: { link: url }
        }
      };
      return admin.messaging().send(message);
    });

    if (sendPromises.length) await Promise.all(sendPromises);
    return;
  });
