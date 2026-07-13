const Session = require("../models/Session");

async function deleteEmptySessions(userId) {
  return Session.deleteMany({
    participants: userId,
    $or: [
      { encryptedLastMessage: { $exists: false } },
      { encryptedLastMessage: null },
      { "encryptedLastMessage.ciphertext": { $exists: false } },
      { "encryptedLastMessage.ciphertext": null },
      { "encryptedLastMessage.ciphertext": "" },
    ],
  });
}

async function getSessionsByUser(userId) {
  return Session.find({ participants: userId })
    .sort({ lastMessageAt: -1 })
    .lean();
}

async function getAllSessionsForUser(userId) {
  return Session.find({ participants: userId }).lean();
}

async function upsertSession(sessionId, fromId, toId, encryptedLastMessage, isNewMessage) {
  const update = {
    $set: {
      encryptedLastMessage,
      lastMessageAt: new Date(),
    },
    $setOnInsert: {
      // sessionId comes from the filter automatically on upsert insert
      participants: [fromId, toId],
      createdBy: fromId,
      createdAt: new Date(),
    },
  };

  if (isNewMessage) {
    update.$inc = { [`unreadCount.${toId}`]: 1 };
  }

  return Session.findOneAndUpdate({ sessionId }, update, { upsert: true });
}

async function resetUnread(sessionId, userId) {
  return Session.findOneAndUpdate(
    { sessionId },
    { $set: { [`unreadCount.${userId}`]: 0 } }
  );
}

module.exports = {
  deleteEmptySessions,
  getSessionsByUser,
  getAllSessionsForUser,
  upsertSession,
  resetUnread,
};
