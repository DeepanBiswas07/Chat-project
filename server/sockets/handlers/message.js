const { getUser } = require("../../store/onlineUsers");
const { isValidEncryptedPayload } = require("../../utils/validation");
const { findMessage, createMessage, getMessages, markMessageRead } = require("../../services/message");
const { upsertSession, resetUnread } = require("../../services/session");

function getSessionId(u1, u2) {
  return [u1, u2].sort().join("_");
}

function formatMessageForClient(msg) {
  const payload = {
    messageId: msg.messageId,
    sessionId: msg.sessionId,
    senderId: msg.senderId,
    receiverId: msg.receiverId,
    encryptedmessage: msg.encryptedmessage,
    nonce: msg.nonce,
    header: msg.header,
    version: msg.version,
    clientId: msg.clientId,
    status: msg.status,
    createdAt: msg.createdAt,
    sentAt: msg.sentAt,
    deliveredAt: msg.deliveredAt,
    readAt: msg.readAt,
  };
  return payload;
}

module.exports = function registerMessageHandler(socket, io, helpers) {
  const { sendUserListToAll, sendUserListToUser, sendSessionListToUser } = helpers;

  // ================= SEND MESSAGE =================
  socket.on("send_message", async ({ to, sessionId, encryptedmessage, nonce, header, clientId, lastMessagePreview }, ack) => {
    try {
      const fromId = socket.data.userId;
      const toId = String(to || "").trim().toLowerCase();
      const safeEncryptedMessage = String(encryptedmessage || "").trim();
      const safeNonce = String(nonce || "").trim();
      const safeHeader = header ? String(header).trim() : "";
      const safeClientId = String(clientId || Date.now().toString());

      if (!fromId) { ack && ack({ error: "Unauthorized" }); return; }
      if (!toId) { ack && ack({ error: "Invalid receiver" }); return; }

      if (!isValidEncryptedPayload({ encryptedmessage: safeEncryptedMessage, nonce: safeNonce, header: safeHeader })) {
        ack && ack({ error: "Invalid encrypted payload" });
        return;
      }

      let convId = sessionId || getSessionId(fromId, toId);

      let msg = await findMessage(fromId, safeClientId);
      const isNewMessage = !msg;

      if (!msg) {
        msg = await createMessage({
          sessionId: convId,
          senderId: fromId,
          receiverId: toId,
          encryptedmessage: safeEncryptedMessage,
          nonce: safeNonce,
          header: safeHeader,
          clientId: safeClientId,
          status: "sent",
          sentAt: new Date(),
        });
      }

      await upsertSession(convId, fromId, toId, {
        ciphertext: safeEncryptedMessage,
        nonce: safeNonce,
        header: safeHeader,
      }, isNewMessage);

      const recipient = getUser(toId);
      if (recipient) {
        io.to(recipient.socketId).emit("receive_message", formatMessageForClient(msg));

        msg.status = "delivered";
        msg.deliveredAt = new Date();
        await msg.save();

        const sender = getUser(fromId);
        if (sender) {
          io.to(sender.socketId).emit("message_status", {
            messageId: msg.messageId,
            clientId: safeClientId,
            status: "delivered",
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

  // ================= LOAD CHAT =================
  socket.on("load_messages", async ({ user2, sessionId }) => {
    try {
      const u1 = socket.data.userId;
      let convId;

      if (sessionId) {
        convId = sessionId;
      } else {
        const u2 = String(user2 || "").trim().toLowerCase();
        if (!u1 || !u2) { socket.emit("chat_history", []); return; }
        convId = getSessionId(u1, u2);
      }

      const msgs = await getMessages(convId);
      socket.emit("chat_history", msgs.map(formatMessageForClient));
    } catch (err) {
      console.error("load_messages error:", err);
      socket.emit("chat_history", []);
    }
  });

  // ================= READ =================
  socket.on("message_read", async ({ messageId }) => {
    try {
      const readerId = socket.data.userId;
      if (!readerId) return;

      const msg = await markMessageRead(messageId, readerId);
      if (!msg) return;

      await resetUnread(msg.sessionId, readerId);

      const sender = getUser(msg.senderId);
      if (sender) {
        io.to(sender.socketId).emit("message_status", {
          messageId,
          clientId: msg.clientId,
          status: "read",
        });
      }

      await sendUserListToUser(readerId);
      await sendSessionListToUser(readerId);
      await sendSessionListToUser(msg.senderId);
    } catch (err) {
      console.error("message_read error:", err);
    }
  });
};
