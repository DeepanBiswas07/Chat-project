"use strict";

const { addUser, getUser, removeUser }                    = require("../../store/onlineUsers");
const { createOrUpdateUser }                              = require("../../services/user");
const { getPendingMessages, updateMessageStatus }         = require("../../services/message");

module.exports = function registerAuthHandler(socket, io, helpers) {
  const { sendUserListToAll, sendSessionList } = helpers;

  socket.on("register", async (_payload, ack) => {
    try {
      // identity comes from socket.data, set during handshake — never from payload
      const id        = socket.data.userId;
      const cleanName = socket.data.name;

      if (!id || !cleanName) {
        ack && ack({ error: "Unauthorized" });
        return;
      }

      const existing = getUser(id);
      if (existing) {
        if (existing.socketId === socket.id) {
          ack && ack({ error: "Already registered" });
          return;
        }
        removeUser(id);
        console.log(`🔄 ${cleanName} reconnected`);
      }

      addUser(id, socket.id, cleanName);
      await createOrUpdateUser(id, cleanName);
      console.log(`👤 ${cleanName} (${id})`);

      ack && ack({ userId: id, name: cleanName });

      (async () => {
        try {
          await sendUserListToAll();
          await sendSessionList(socket, id);

          const pending = await getPendingMessages(id);
          for (const msg of pending) {
            await updateMessageStatus(msg._id, "delivered", "deliveredAt");
            const sender = getUser(msg.senderId);
            if (sender) {
              io.to(sender.socketId).emit("message_status", {
                messageId: msg.messageId,
                clientId:  msg.clientId,
                status:    "delivered",
              });
            }
          }
        } catch (err) {
          console.error("Post-register error:", err);
        }
      })();
    } catch (err) {
      console.error("register error:", err);
      ack && ack({ error: "Server error during registration" });
    }
  });

  socket.on("logout", async () => {
    try {
      const userId = socket.data.userId;
      if (!userId) return;
      removeUser(userId);
      socket.data.userId = null;
      console.log(`🚪 Logout: ${userId}`);
      await sendUserListToAll();
    } catch (err) {
      console.error("logout error:", err);
    }
  });
};
