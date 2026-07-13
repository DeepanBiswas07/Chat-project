const { getUser, removeUser } = require("../../store/onlineUsers");

module.exports = function registerPresenceHandler(socket, io, helpers) {
  const { sendUserList, sendUserListToAll } = helpers;

  // ================= GET USERS =================
  socket.on("get_users", async () => {
    const userId = socket.data.userId;
    if (!userId) return;

    await sendUserList(socket, userId);
  });

  // ================= TYPING =================
  socket.on("typing_start", ({ to, sessionId }) => {
    const from = socket.data.userId;
    const toId = String(to || "").trim().toLowerCase();

    if (!from || !toId || !sessionId) return;

    const recipient = getUser(toId);
    if (recipient) {
      io.to(recipient.socketId).emit("typing_start", { from, sessionId });
    }
  });

  socket.on("typing_stop", ({ to, sessionId }) => {
    const from = socket.data.userId;
    const toId = String(to || "").trim().toLowerCase();

    if (!from || !toId || !sessionId) return;

    const recipient = getUser(toId);
    if (recipient) {
      io.to(recipient.socketId).emit("typing_stop", { from, sessionId });
    }
  });

  // ================= DISCONNECT =================
  socket.on("disconnect", async () => {
    const userId = socket.data.userId;

    if (userId && getUser(userId)) {
      removeUser(userId);
      console.log("🔴 Disconnected:", userId);
    }

    await sendUserListToAll();
  });
};
