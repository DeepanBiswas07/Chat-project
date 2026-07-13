const Message = require("../models/Message");

async function findMessage(senderId, clientId) {
  return Message.findOne({ senderId, clientId });
}

async function createMessage(data) {
  return Message.create(data);
}

async function getMessages(sessionId) {
  return Message.find({ sessionId }).sort({ createdAt: 1 }).lean();
}

async function markMessageRead(messageId, readerId) {
  return Message.findOneAndUpdate(
    { messageId, receiverId: readerId },
    { status: "read", readAt: new Date() },
    { returnDocument: "after" }
  );
}

async function updateMessageStatus(msgId, status, field) {
  const update = { status };
  update[field] = new Date();
  return Message.updateOne({ _id: msgId }, update);
}

async function getPendingMessages(receiverId) {
  return Message.find({ receiverId, status: "sent" }).lean();
}

module.exports = {
  findMessage,
  createMessage,
  getMessages,
  markMessageRead,
  updateMessageStatus,
  getPendingMessages,
};
