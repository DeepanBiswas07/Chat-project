const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    default: uuidv4,
    unique: true,
  },

  participants: [
    {
      type: String,
      index: true,
    }
  ],

  createdBy: String,

  encryptedLastMessage: {
    ciphertext: String,
    nonce: String,
    header: String,
  },

  lastMessageAt: Date,

  unreadCount: {
    type: Map,
    of: Number,
    default: {},
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Session", sessionSchema);
