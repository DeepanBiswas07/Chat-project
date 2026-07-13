const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    default: uuidv4,
    unique: true,
  },

  sessionId: {
    type: String,
    required: true,
    index: true,
  },

  senderId: {
    type: String,
    required: true,
    index: true,
  },

  receiverId: {
    type: String,
    required: true,
    index: true,
  },

  encryptedmessage: {
    type: String,
    required: true,
  },

  nonce: {
    type: String,
    required: true,
  },

  header: String,

  version: {
    type: Number,
    default: 1,
  },

  clientId: {
    type: String,
    required: true,
  },


  status: {
    type: String,
    enum: ["waiting", "sent", "delivered", "read"],
    default: "sent",
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },

  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
});

// Deduplication
messageSchema.index(
  { senderId: 1, clientId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Message", messageSchema);
