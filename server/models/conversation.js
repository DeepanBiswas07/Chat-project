const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const conversationSchema = new mongoose.Schema({
  conversationId: {
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

  lastMessage: String,
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

module.exports = mongoose.model("Conversation", conversationSchema);
