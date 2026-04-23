require("./db");

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const User = require("./models/User");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

const users = {};

function getConversationId(u1, u2) {
  return [u1, u2].sort().join("_");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function conversationMatchRegex(userId) {
  return new RegExp(`(^|_)${escapeRegex(userId)}(_|$)`);
}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.data.registeredUserId = null;
  socket.data.registeredName = null;

  socket.on("register", async ({ userId, name }, ack) => {
    const id = String(userId || "").trim().toLowerCase();
    const cleanName = String(name || "").trim();

    if (!id || !cleanName) return;

    if (
      socket.data.registeredUserId === id &&
      socket.data.registeredName === cleanName
    ) {
      if (typeof ack === "function") {
        ack({ userId: id, name: cleanName, alreadyRegistered: true });
      }
      return;
    }

    socket.data.registeredUserId = id;
    socket.data.registeredName = cleanName;

    users[id] = {
      socketId: socket.id,
      name: cleanName,
    };

    await User.findOneAndUpdate(
      { userId: id },
      { name: cleanName },
      { upsert: true }
    );

    console.log(`👤 ${cleanName} (${id})`);

    io.emit(
      "user_list",
      Object.keys(users).map((u) => ({
        userId: u,
        name: users[u].name,
      }))
    );

    if (typeof ack === "function") {
      ack({ userId: id, name: cleanName, alreadyRegistered: false });
    }
  });

  socket.on("get_users", () => {
    socket.emit(
      "user_list",
      Object.keys(users).map((u) => ({
        userId: u,
        name: users[u].name,
      }))
    );
  });

  socket.on("get_conversations", async ({ userId }) => {
    const id = String(userId || "").trim().toLowerCase();

    if (!id) {
      socket.emit("conversation_list", []);
      return;
    }

    const messages = await Message.find({
      conversationId: conversationMatchRegex(id),
    }).sort({ timestamp: 1 });

    const otherIds = [
      ...new Set(
        messages.flatMap((m) =>
          String(m.conversationId)
            .split("_")
            .filter((part) => part && part !== id)
        )
      ),
    ];

    const foundUsers = await User.find({
      userId: { $in: otherIds },
    }).lean();

    const nameMap = new Map(foundUsers.map((u) => [u.userId, u.name]));

    socket.emit(
      "conversation_list",
      otherIds.map((otherId) => ({
        userId: otherId,
        name: nameMap.get(otherId) || otherId,
      }))
    );
  });

  socket.on("send_message", async ({ from, to, message, clientId }, ack) => {
    const fromId = String(from || "").trim().toLowerCase();
    const toId = String(to || "").trim().toLowerCase();
    const text = String(message || "").trim();
    const safeClientId = String(clientId || Date.now().toString());

    if (!fromId || !toId || !text) return;

    const convId = getConversationId(fromId, toId);

    let msg = await Message.findOne({
      conversationId: convId,
      clientId: safeClientId,
    });

    if (!msg) {
      msg = await Message.create({
        conversationId: convId,
        sender: fromId,
        text,
        clientId: safeClientId,
        delivered: false,
        pushedToReceiver: false,
        timestamp: new Date(),
      });
    }

    let deliveredNow = false;

    if (!msg.pushedToReceiver && users[toId]) {
      io.to(users[toId].socketId).emit("receive_message", {
        ...msg.toObject(),
        fromName: users[fromId]?.name || fromId,
      });

      msg.pushedToReceiver = true;
    }

    if (!msg.delivered && users[toId] && users[fromId]) {
      msg.delivered = true;
      deliveredNow = true;

      io.to(users[fromId].socketId).emit("message_delivered", {
        clientId: safeClientId,
      });
    }

    await msg.save();

    if (typeof ack === "function") {
      ack({
        ...msg.toObject(),
        deliveredNow,
      });
    }
  });

  socket.on("load_messages", async ({ user1, user2 }) => {
    const u1 = String(user1 || "").trim().toLowerCase();
    const u2 = String(user2 || "").trim().toLowerCase();

    if (!u1 || !u2) {
      socket.emit("chat_history", []);
      return;
    }

    const convId = getConversationId(u1, u2);

    const msgs = await Message.find({ conversationId: convId }).sort({
      timestamp: 1,
    });

    socket.emit("chat_history", msgs);
  });

  socket.on("disconnect", () => {
    for (const id in users) {
      if (users[id].socketId === socket.id) {
        delete users[id];
      }
    }

    io.emit(
      "user_list",
      Object.keys(users).map((u) => ({
        userId: u,
        name: users[u].name,
      }))
    );
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("🚀 Server running");
});