const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  sender: { type: String, required: true, index: true },
  text: { type: String, required: true },
  clientId: { type: String, required: true },
  delivered: { type: Boolean, default: false },
  pushedToReceiver: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true },
});

messageSchema.index({ conversationId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.model("Message", messageSchema);