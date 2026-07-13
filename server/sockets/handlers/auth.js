const { addUser, getUser, removeUser } = require("../../store/onlineUsers");
const { createOrUpdateUser } = require("../../services/user");
const { getPendingMessages, updateMessageStatus } = require("../../services/message");

module.exports = function registerAuthHandler(socket, io, helpers) {
  const { sendUserListToAll, sendSessionList } = helpers;

  // ================= REGISTER =================
  socket.on("register", async ({ name }, ack) => {
    try {
      const cleanName = String(name || "").trim();
      const id = cleanName.toLowerCase();

      if (!id || !cleanName) {
        ack && ack({ error: "Invalid name" });
        return;
      }

      const existingUser = getUser(id);
      if (existingUser) {
        if (existingUser.socketId === socket.id) {
          // Same socket registered twice — shouldn't happen but guard it
          ack && ack({ error: "User already logged in" });
          return;
        }
        // Different socket = reconnect: evict old entry so new socket takes over
        removeUser(id);
        console.log(`🔄 ${cleanName} reconnected (evicted old socket)`);
      }

      socket.data.userId = id;
      socket.data.name = cleanName;

      addUser(id, socket.id, cleanName);

      await createOrUpdateUser(id, cleanName);

      console.log(`👤 ${cleanName} (${id})`);

      ack && ack({ userId: id, name: cleanName });

      (async () => {
        try {
          await sendUserListToAll();
          await sendSessionList(socket, id);

          const pendingMessages = await getPendingMessages(id);

          for (const msg of pendingMessages) {
            await updateMessageStatus(msg._id, "delivered", "deliveredAt");

            const sender = getUser(msg.senderId);
            if (sender) {
              io.to(sender.socketId).emit("message_status", {
                messageId: msg.messageId,
                clientId: msg.clientId,
                status: "delivered",
              });
            }
          }
        } catch (err) {
          console.error("Post-login async error:", err);
        }
      })();
    } catch (err) {
      console.error("register error:", err);
      ack && ack({ error: "Server error during registration" });
    }
  });

  // ================= LOGOUT =================
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
