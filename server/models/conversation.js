const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  users: [String], // [user1, user2]
});

module.exports = mongoose.model("Conversation", conversationSchema);