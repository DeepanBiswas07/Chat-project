"use strict";

const { v4: uuidv4 }     = require("uuid");
const { generalLimiter } = require("../../middleware/socketRateLimit");

module.exports = function registerSessionHandler(socket, io, helpers) {
  const { sendSessionList } = helpers;

  socket.on("get_sessions", async () => {
    try {
      if (!generalLimiter(socket)) return;
      const id = socket.data.userId;
      if (!id) return;
      await sendSessionList(socket, id);
    } catch (err) {
      console.error("get_sessions error:", err);
    }
  });

  socket.on("create_session", async (payload, ack) => {
    try {
      const fromId = socket.data.userId;
      const raw    = payload && typeof payload === "object" ? payload : {};
      const toId   = String(raw.to || "").trim().toLowerCase();

      if (!fromId || !toId) return;
      if (fromId === toId) { ack && ack({ error: "Cannot create session with yourself" }); return; }

      ack && ack({
        sessionId:    uuidv4(),
        participants: [fromId, toId],
        createdBy:    fromId,
        createdAt:    new Date(),
      });
    } catch (err) {
      console.error("create_session error:", err);
      ack && ack({ error: "Server error" });
    }
  });
};
