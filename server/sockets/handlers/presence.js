"use strict";

const { getUser, removeUser }                          = require("../../store/onlineUsers");
const { typingLimiter, generalLimiter, cleanupSocket } = require("../../middleware/socketRateLimit");

module.exports = function registerPresenceHandler(socket, io, helpers) {
  const { sendUserList, sendUserListToAll } = helpers;

  socket.on("get_users", async () => {
    try {
      if (!generalLimiter(socket)) return;
      const userId = socket.data.userId;
      if (!userId) return;
      await sendUserList(socket, userId);
    } catch (err) {
      console.error("get_users error:", err);
    }
  });

  socket.on("typing_start", (payload) => {
    try {
      if (!typingLimiter(socket)) return;
      const from      = socket.data.userId;
      const raw       = payload && typeof payload === "object" ? payload : {};
      const toId      = String(raw.to        || "").trim().toLowerCase();
      const sessionId = String(raw.sessionId || "").trim();
      if (!from || !toId || !sessionId) return;
      const recipient = getUser(toId);
      if (recipient) io.to(recipient.socketId).emit("typing_start", { from, sessionId });
    } catch (err) {
      console.error("typing_start error:", err);
    }
  });

  socket.on("typing_stop", (payload) => {
    try {
      if (!typingLimiter(socket)) return;
      const from      = socket.data.userId;
      const raw       = payload && typeof payload === "object" ? payload : {};
      const toId      = String(raw.to        || "").trim().toLowerCase();
      const sessionId = String(raw.sessionId || "").trim();
      if (!from || !toId || !sessionId) return;
      const recipient = getUser(toId);
      if (recipient) io.to(recipient.socketId).emit("typing_stop", { from, sessionId });
    } catch (err) {
      console.error("typing_stop error:", err);
    }
  });

  socket.on("disconnect", async (reason) => {
    try {
      const userId = socket.data.userId;
      if (userId) {
        const stored = getUser(userId);
        // only evict if this socket still owns the slot (guards reconnect races)
        if (stored && stored.socketId === socket.id) {
          removeUser(userId);
          console.log(`🔴 Disconnected: ${userId} (${reason})`);
        }
      }
      cleanupSocket(socket.id);
      await sendUserListToAll();
    } catch (err) {
      console.error("disconnect error:", err);
    }
  });
};
