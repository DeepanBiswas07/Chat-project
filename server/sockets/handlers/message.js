"use strict";

const { getUser }                                         = require("../../store/onlineUsers");
const { isValidEncryptedPayload }                         = require("../../utils/validation");
const { findMessage, createMessage, getMessages, markMessageRead } = require("../../services/message");
const { createOrUpdateSession, resetUnread }              = require("../../services/session");
const { messageLimiter }                                  = require("../../middleware/socketRateLimit");

function getSessionId(u1, u2) {
  return [u1, u2].sort().join("_");
}

function formatMessageForClient(msg) {
  return {
    messageId:        msg.messageId,
    sessionId:        msg.sessionId,
    senderId:         msg.senderId,
    receiverId:       msg.receiverId,
    encryptedmessage: msg.encryptedmessage,
    nonce:            msg.nonce,
    header:           msg.header,
    version:          msg.version,
    clientId:         msg.clientId,
    status:           msg.status,
    createdAt:        msg.createdAt,
    sentAt:           msg.sentAt,
    deliveredAt:      msg.deliveredAt,
    readAt:           msg.readAt,
  };
}

module.exports = function registerMessageHandler(socket, io, helpers) {
  const { sendUserListToAll, sendUserListToUser, sendSessionListToUser } = helpers;

  socket.on("send_message", async (payload, ack) => {
    try {
      if (!messageLimiter(socket, ack)) return;

      const fromId = socket.data.userId; // always from server, never payload
      if (!fromId) { ack && ack({ error: "Unauthorized" }); return; }

      const raw = payload && typeof payload === "object" ? payload : {};

      const toId               = String(raw.to               || "").trim().toLowerCase();
      const safeEncryptedMessage = String(raw.encryptedmessage || "").trim();
      const safeNonce          = String(raw.nonce             || "").trim();
      const safeHeader         = raw.header ? String(raw.header).trim() : "";
      const safeClientId       = String(raw.clientId         || Date.now().toString()).slice(0, 128);
      const sessionId          = raw.sessionId ? String(raw.sessionId).trim() : null;

      if (!toId)          { ack && ack({ error: "Invalid receiver" }); return; }
      if (fromId === toId) { ack && ack({ error: "Cannot message yourself" }); return; }

      if (!isValidEncryptedPayload({ encryptedmessage: safeEncryptedMessage, nonce: safeNonce, header: safeHeader })) {
        ack && ack({ error: "Invalid encrypted payload" });
        return;
      }

      const convId = sessionId || getSessionId(fromId, toId);

      let msg = await findMessage(fromId, safeClientId);
      const isNew = !msg;

      if (!msg) {
        msg = await createMessage({
          sessionId:        convId,
          senderId:         fromId,
          receiverId:       toId,
          encryptedmessage: safeEncryptedMessage,
          nonce:            safeNonce,
          header:           safeHeader,
          clientId:         safeClientId,
          status:           "sent",
          sentAt:           new Date(),
        });
      }

      await createOrUpdateSession(convId, fromId, toId, {
        ciphertext: safeEncryptedMessage,
        nonce:      safeNonce,
        header:     safeHeader,
      }, isNew);

      const recipient = getUser(toId);
      if (recipient) {
        io.to(recipient.socketId).emit("receive_message", formatMessageForClient(msg));
        msg.status      = "delivered";
        msg.deliveredAt = new Date();
        await msg.save();

        const sender = getUser(fromId);
        if (sender) {
          io.to(sender.socketId).emit("message_status", {
            messageId: msg.messageId,
            clientId:  safeClientId,
            status:    "delivered",
          });
        }
      }

      await sendUserListToAll();
      await sendSessionListToUser(fromId);
      await sendSessionListToUser(toId);

      ack && ack(formatMessageForClient(msg));
    } catch (err) {
      console.error("send_message error:", err);
      ack && ack({ error: "Server error" });
    }
  });

  socket.on("load_messages", async (payload) => {
    try {
      const u1  = socket.data.userId;
      if (!u1) return;

      const raw = payload && typeof payload === "object" ? payload : {};
      let convId;

      if (raw.sessionId) {
        convId = String(raw.sessionId).trim();
      } else {
        const u2 = String(raw.user2 || "").trim().toLowerCase();
        if (!u2) { socket.emit("chat_history", []); return; }
        convId = getSessionId(u1, u2);
      }

      if (!convId) { socket.emit("chat_history", []); return; }

      const msgs = await getMessages(convId);
      socket.emit("chat_history", msgs.map(formatMessageForClient));
    } catch (err) {
      console.error("load_messages error:", err);
      socket.emit("chat_history", []);
    }
  });

  socket.on("message_read", async (payload) => {
    try {
      const readerId = socket.data.userId;
      if (!readerId) return;

      const raw       = payload && typeof payload === "object" ? payload : {};
      const messageId = String(raw.messageId || "").trim();
      if (!messageId) return;

      const msg = await markMessageRead(messageId, readerId);
      if (!msg) return;

      await resetUnread(msg.sessionId, readerId);

      const sender = getUser(msg.senderId);
      if (sender) {
        io.to(sender.socketId).emit("message_status", { messageId, clientId: msg.clientId, status: "read" });
      }

      await sendUserListToUser(readerId);
      await sendSessionListToUser(readerId);
      await sendSessionListToUser(msg.senderId);
    } catch (err) {
      console.error("message_read error:", err);
    }
  });
};
