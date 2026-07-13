const { Server } = require("socket.io");
const Message = require("../models/Message");
const User = require("../models/User");

const { getUser, getAllUsers } = require("../store/onlineUsers");
const {
  getAllSessionsForUser,
  deleteEmptySessions,
  getSessionsByUser,
} = require("../services/session");

const registerAuthHandler     = require("./handlers/auth");
const registerMessageHandler  = require("./handlers/message");
const registerSessionHandler  = require("./handlers/session");
const registerPresenceHandler = require("./handlers/presence");
const registerKeyHandler      = require("./handlers/key");

// ---- Shared formatting helpers ----

function getUnreadValue(unreadCount, userId) {
  if (!unreadCount) return 0;
  if (typeof unreadCount.get === "function") return unreadCount.get(userId) || 0;
  return unreadCount[userId] || 0;
}

function formatSessionForUser(session, currentUserId) {
  return {
    sessionId: session.sessionId,
    participants: session.participants,
    encryptedLastMessage: session.encryptedLastMessage || null,
    lastMessageAt: session.lastMessageAt,
    unreadCount: getUnreadValue(session.unreadCount, currentUserId),
    createdAt: session.createdAt,
  };
}

// ---- Socket.IO initializer ----

function initSocket(server) {
  const io = new Server(server, {
    cors: { origin: process.env.CORS_ORIGIN || "*" },
  });

  // ---- Broadcast helpers (close over io) ----

  async function sendUserList(socket, currentUserId) {
    const users = getAllUsers();

    const sessions = await getAllSessionsForUser(currentUserId);
    const chattedUserIds = new Set();
    const userUnread = {};

    sessions.forEach((session) => {
      const unread = getUnreadValue(session.unreadCount, currentUserId);
      session.participants.forEach((participantId) => {
        if (participantId === currentUserId) return;
        chattedUserIds.add(participantId);
        userUnread[participantId] = (userUnread[participantId] || 0) + unread;
      });
    });

    // Backward compatibility: old chats that only have messages
    const fallbackMessages = await Message.find({
      $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
    })
      .select("senderId receiverId")
      .lean();

    fallbackMessages.forEach((m) => {
      if (m.senderId !== currentUserId) chattedUserIds.add(m.senderId);
      if (m.receiverId !== currentUserId) chattedUserIds.add(m.receiverId);
    });

    const onlineUsers = Object.keys(users)
      .filter((id) => id !== currentUserId)
      .map((id) => ({
        userId: id,
        name: users[id].name,
        online: true,
        unreadCount: userUnread[id] || 0,
      }));

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

    socket.emit("user_list", [...onlineUsers, ...offlineUsers]);
  }

  async function sendUserListToUser(userId) {
    const user = getUser(userId);
    if (!user) return;
    const socket = io.sockets.sockets.get(user.socketId);
    if (socket) await sendUserList(socket, userId);
  }

  async function sendUserListToAll() {
    const users = getAllUsers();
    for (const userId in users) {
      const socket = io.sockets.sockets.get(users[userId].socketId);
      if (socket) await sendUserList(socket, userId);
    }
  }

  async function sendSessionList(socket, currentUserId) {
    await deleteEmptySessions(currentUserId);
    const sessions = await getSessionsByUser(currentUserId);
    socket.emit(
      "session_list",
      sessions.map((session) => formatSessionForUser(session, currentUserId))
    );
  }

  async function sendSessionListToUser(userId) {
    const user = getUser(userId);
    if (!user) return;
    const socket = io.sockets.sockets.get(user.socketId);
    if (socket) await sendSessionList(socket, userId);
  }

  // Bundle all helpers for handlers
  const helpers = {
    sendUserList,
    sendUserListToUser,
    sendUserListToAll,
    sendSessionList,
    sendSessionListToUser,
  };

  // ---- Connection ----

  io.on("connection", (socket) => {
    console.log("🟢 Connected:", socket.id);

    socket.data.userId = null;
    socket.data.name = null;

    registerAuthHandler(socket, io, helpers);
    registerMessageHandler(socket, io, helpers);
    registerSessionHandler(socket, io, helpers);
    registerPresenceHandler(socket, io, helpers);
    registerKeyHandler(socket, io, helpers);
  });

  return io;
}

module.exports = { initSocket };
