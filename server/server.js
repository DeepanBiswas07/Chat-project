require("./db");

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const User = require("./models/User");
const Message = require("./models/Message");
const Conversation = require("./models/Conversation");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// in-memory online users
const users = {};

// fallback old conversationId
function getConversationId(u1, u2) {
  return [u1, u2].sort().join("_");
}

function getUnreadValue(unreadCount, userId) {
  if (!unreadCount) return 0;

  if (typeof unreadCount.get === "function") {
    return unreadCount.get(userId) || 0;
  }

  return unreadCount[userId] || 0;
}

function formatConversationForUser(convo, currentUserId) {
  return {
    conversationId: convo.conversationId,
    participants: convo.participants,
    lastMessage: convo.lastMessage,
    lastMessageAt: convo.lastMessageAt,
    unreadCount: getUnreadValue(convo.unreadCount, currentUserId),
    createdAt: convo.createdAt,
  };
}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.data.userId = null;
  socket.data.name = null;

  // ================= REGISTER =================
  socket.on("register", async ({ userId, name }, ack) => {
    const id = String(userId || "").trim().toLowerCase();
    const cleanName = String(name || "").trim();

    if (!id || !cleanName) return;

    socket.data.userId = id;
    socket.data.name = cleanName;

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

    await sendUserListToAll();
    await sendConversationList(socket, id);

    // mark pending delivered
    const pendingMessages = await Message.find({
      receiverId: id,
      status: "sent",
    });

    for (const msg of pendingMessages) {
      msg.status = "delivered";
      msg.deliveredAt = new Date();
      await msg.save();

      if (users[msg.senderId]) {
        io.to(users[msg.senderId].socketId).emit("message_status", {
          messageId: msg.messageId,
          clientId: msg.clientId,
          status: "delivered",
        });
      }
    }

    ack && ack({ userId: id, name: cleanName });
  });

  // ================= GET USERS =================
  socket.on("get_users", async () => {
    const userId = socket.data.userId;
    if (!userId) return;

    await sendUserList(socket, userId);
  });

  // ================= CREATE CONVERSATION =================
  socket.on("create_conversation", async ({ from, to }, ack) => {
    const fromId = String(from || "").trim().toLowerCase();
    const toId = String(to || "").trim().toLowerCase();

    if (!fromId || !toId) return;

    const convo = {
      conversationId: uuidv4(),
      participants: [fromId, toId],
      createdBy: fromId,
      createdAt: new Date(),
    };

    ack && ack(convo);
  });

  // ================= GET CONVERSATIONS =================
  socket.on("get_conversations", async ({ userId }) => {
    const id = String(userId || "").trim().toLowerCase();

    if (!id) return;

    await sendConversationList(socket, id);
  });

  // ================= SEND MESSAGE =================
  socket.on("send_message", async ({ from, to, message, clientId, conversationId }, ack) => {
    const fromId = String(from || "").trim().toLowerCase();
    const toId = String(to || "").trim().toLowerCase();
    const text = String(message || "").trim();
    const safeClientId = String(clientId || Date.now().toString());

    if (!fromId || !toId || !text) return;

    // 🔥 use new OR fallback
    let convId = conversationId;

    if (!convId) {
      convId = getConversationId(fromId, toId);
    }

    let msg = await Message.findOne({
      senderId: fromId,
      clientId: safeClientId,
    });

    const isNewMessage = !msg;

    if (!msg) {
      msg = await Message.create({
        conversationId: convId,
        senderId: fromId,
        receiverId: toId,
        text,
        clientId: safeClientId,
        status: "sent",
        sentAt: new Date(),
      });
    }

    const conversationUpdate = {
      $set: {
        lastMessage: text,
        lastMessageAt: new Date(),
      },
      $setOnInsert: {
        conversationId: convId,
        participants: [fromId, toId],
        createdBy: fromId,
        createdAt: new Date(),
      },
    };

    if (isNewMessage) {
      conversationUpdate.$inc = {
        [`unreadCount.${toId}`]: 1,
      };
    }

    await Conversation.findOneAndUpdate(
      { conversationId: convId },
      conversationUpdate,
      { upsert: true }
    );

    // deliver if online
    if (users[toId]) {
      io.to(users[toId].socketId).emit("receive_message", msg);

      msg.status = "delivered";
      msg.deliveredAt = new Date();

      if (users[fromId]) {
        io.to(users[fromId].socketId).emit("message_status", {
          messageId: msg.messageId,
          clientId: safeClientId,
          status: "delivered",
        });
      }
    }

    await msg.save();

    await sendUserListToAll();
    await sendConversationListToUser(fromId);
    await sendConversationListToUser(toId);

    ack && ack(msg);
  });

  // ================= LOAD CHAT =================
  socket.on("load_messages", async ({ user1, user2, conversationId }) => {
    let convId;

    if (conversationId) {
      convId = conversationId;
    } else {
      const u1 = String(user1 || "").trim().toLowerCase();
      const u2 = String(user2 || "").trim().toLowerCase();

      if (!u1 || !u2) {
        socket.emit("chat_history", []);
        return;
      }

      convId = getConversationId(u1, u2);
    }

    const msgs = await Message.find({
      conversationId: convId,
    }).sort({ createdAt: 1 });

    socket.emit("chat_history", msgs);
  });

  // ================= READ =================
  socket.on("message_read", async ({ messageId }) => {
    const msg = await Message.findOneAndUpdate(
      { messageId },
      {
        status: "read",
        readAt: new Date(),
      },
      { returnDocument: "after" }
    );

    if (!msg) return;

    const readerId = socket.data.userId || msg.receiverId;

    await Conversation.findOneAndUpdate(
      { conversationId: msg.conversationId },
      {
        $set: {
          [`unreadCount.${readerId}`]: 0,
        },
      }
    );

    if (users[msg.senderId]) {
      io.to(users[msg.senderId].socketId).emit("message_status", {
        messageId,
        clientId: msg.clientId,
        status: "read",
      });
    }

    await sendUserListToUser(readerId);
    await sendConversationListToUser(readerId);
    await sendConversationListToUser(msg.senderId);
  });

  // ================= DISCONNECT =================
  socket.on("disconnect", async () => {
    let disconnectedUser = null;

    for (const id in users) {
      if (users[id].socketId === socket.id) {
        disconnectedUser = id;
        delete users[id];
      }
    }

    console.log("🔴 Disconnected:", socket.id);

    if (disconnectedUser) {
      await sendUserListToAll();
    }
  });
});


// ================= USER LIST LOGIC =================
async function sendUserList(socket, currentUserId) {
  const conversations = await Conversation.find({
    participants: currentUserId,
  }).lean();

  const chattedUserIds = new Set();
  const userUnread = {};

  conversations.forEach((convo) => {
    const unread = getUnreadValue(convo.unreadCount, currentUserId);

    convo.participants.forEach((participantId) => {
      if (participantId === currentUserId) return;

      chattedUserIds.add(participantId);
      userUnread[participantId] = (userUnread[participantId] || 0) + unread;
    });
  });

  // Backward compatibility for older chats that only have messages.
  const fallbackMessages = await Message.find({
    $or: [
      { senderId: currentUserId },
      { receiverId: currentUserId },
    ],
  })
    .select("senderId receiverId")
    .lean();

  fallbackMessages.forEach((m) => {
    if (m.senderId !== currentUserId) chattedUserIds.add(m.senderId);
    if (m.receiverId !== currentUserId) chattedUserIds.add(m.receiverId);
  });

  // ALL ONLINE USERS
  const onlineUsers = Object.keys(users)
    .filter((id) => id !== currentUserId)
    .map((id) => ({
      userId: id,
      name: users[id].name,
      online: true,
      unreadCount: userUnread[id] || 0,
    }));

  // CHATTED USERS
  const chattedUsers = await User.find({
    userId: { $in: [...chattedUserIds] },
  }).lean();

  const offlineUsers = chattedUsers
    .filter((u) => !users[u.userId] && u.userId !== currentUserId)
    .map((u) => ({
      userId: u.userId,
      name: u.name,
      online: false,
      unreadCount: userUnread[u.userId] || 0,
    }));

  const result = [...onlineUsers, ...offlineUsers];

  socket.emit("user_list", result);
}

async function sendUserListToUser(userId) {
  if (!users[userId]) return;

  const socket = io.sockets.sockets.get(users[userId].socketId);

  if (socket) {
    await sendUserList(socket, userId);
  }
}

async function sendConversationList(socket, currentUserId) {
  await Conversation.deleteMany({
    participants: currentUserId,
    $or: [
      { lastMessage: { $exists: false } },
      { lastMessage: null },
      { lastMessage: "" },
    ],
  });

  const convos = await Conversation.find({
    participants: currentUserId,
  })
    .sort({ lastMessageAt: -1 })
    .lean();

  socket.emit(
    "conversation_list",
    convos.map((convo) => formatConversationForUser(convo, currentUserId))
  );
}

async function sendConversationListToUser(userId) {
  if (!users[userId]) return;

  const socket = io.sockets.sockets.get(users[userId].socketId);

  if (socket) {
    await sendConversationList(socket, userId);
  }
}


// broadcast
async function sendUserListToAll() {
  for (const userId in users) {
    const socketId = users[userId].socketId;
    const socket = io.sockets.sockets.get(socketId);

    if (socket) {
      await sendUserList(socket, userId);
    }
  }
}

server.listen(3000, "0.0.0.0", () => {
  console.log("🚀 Server running");
});
