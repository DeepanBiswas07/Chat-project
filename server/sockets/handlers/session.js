const { v4: uuidv4 } = require("uuid");

module.exports = function registerSessionHandler(socket, io, helpers) {
  const { sendSessionList } = helpers;

  // ================= GET SESSIONS =================
  socket.on("get_sessions", async () => {
    const id = socket.data.userId;
    if (!id) return;

    await sendSessionList(socket, id);
  });

  // ================= CREATE SESSION =================
  socket.on("create_session", async ({ to }, ack) => {
    const fromId = socket.data.userId;
    const toId = String(to || "").trim().toLowerCase();

    if (!fromId || !toId) return;

    const session = {
      sessionId: uuidv4(),
      participants: [fromId, toId],
      createdBy: fromId,
      createdAt: new Date(),
    };

    ack && ack(session);
  });
};
