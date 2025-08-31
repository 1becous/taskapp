const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const ALLOWED_COLUMNS = new Set(['right','center']); // без "left" (Готово)
const NOTIFY_ON_MOVES = true;

function topicFor(boardId, column) {
  return `board_${boardId}_${column}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
}

// callable: subscribe
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

// callable: unsubscribe
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

// тригер: шлемо пуші при появі нового таску
exports.notifyOnNewTasks = functions.firestore
  .document('boards/{boardId}')
  .onWrite(async (change, context) => {
    const boardId = context.params.boardId;
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    if (!after) return;

    const boardName = after.name || 'Тайтл';

    const toSet = (arr=[]) => new Set(arr.map(t => t.id));
    const beforeRight = toSet(Array.isArray(before?.right)?before.right:[]);
    const beforeCenter = toSet(Array.isArray(before?.center)?before.center:[]);
    const allBefore = new Set([...(Array.isArray(before?.right)?before.right:[]), ...(Array.isArray(before?.center)?before.center:[]), ...(Array.isArray(before?.left)?before.left:[])]
      .map(t=>t.id));

    const events = [];

    // right
    if (ALLOWED_COLUMNS.has('right')) {
      for (const t of (Array.isArray(after.right)?after.right:[])) {
        const wasInRight = beforeRight.has(t.id);
        const isNewToBoard = !allBefore.has(t.id);
        if (!wasInRight && (NOTIFY_ON_MOVES || isNewToBoard)) {
          events.push({ column:'right', task:t });
        }
      }
    }

    // center
    if (ALLOWED_COLUMNS.has('center')) {
      for (const t of (Array.isArray(after.center)?after.center:[])) {
        const wasInCenter = beforeCenter.has(t.id);
        const isNewToBoard = !allBefore.has(t.id);
        if (!wasInCenter && (NOTIFY_ON_MOVES || isNewToBoard)) {
          events.push({ column:'center', task:t });
        }
      }
    }

    const send = events.map(({ column, task }) => {
      const titleUA = column === 'right' ? 'Новий таск у «На редагування»' : 'Новий таск у «На тайп»';
      const topic = topicFor(boardId, column);
      return admin.messaging().send({
        topic,
        webpush: {
          notification: {
            title: `${titleUA} — ${boardName}`,
            body: task?.title || 'Перегляньте деталі',
            icon: '/icons/192.png'
          },
          fcmOptions: { link: task?.url || '/' }
        }
      });
    });

    if (send.length) await Promise.all(send);
    return;
  });
