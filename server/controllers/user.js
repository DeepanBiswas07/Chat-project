"use strict";

const { createOrUpdateUser }     = require("../services/user");
const { registerKeys }           = require("../services/key");
const { getAllUsers }             = require("../store/onlineUsers");
const { getAllSessionsForUser }   = require("../services/session");
const User    = require("../models/User");
const Message = require("../models/Message");

function getUnreadValue(unreadCount, userId) {
  if (!unreadCount) return 0;
  if (typeof unreadCount.get === "function") return unreadCount.get(userId) || 0;
  return unreadCount[userId] || 0;
}

// POST /api/user/setup
async function setupUser(req, res) {
  try {
    const { name, identityPublicKey, signedPreKey, signedPreKeySignature, oneTimePreKeys } = req.body;

    const cleanUserId = req.identity?.userId; // from verified token, never from body
    const cleanName   = String(name || "").trim();

    if (!cleanUserId)         return res.status(401).json({ success: false, error: "Unauthorized" });
    if (!cleanName)           return res.json({ success: false, error: "name is required" });
    if (cleanName.length > 100) return res.json({ success: false, error: "name too long" });

    await createOrUpdateUser(cleanUserId, cleanName);

    if (identityPublicKey) {
      const cleanKeys = Array.isArray(oneTimePreKeys)
        ? oneTimePreKeys.filter((k) => k && k.keyId && k.publicKey)
                        .map((k) => ({ keyId: String(k.keyId), publicKey: String(k.publicKey) }))
        : [];

      await registerKeys(
        cleanUserId,
        cleanName,
        String(identityPublicKey).trim(),
        signedPreKey          ? String(signedPreKey).trim()          : "",
        signedPreKeySignature ? String(signedPreKeySignature).trim() : "",
        cleanKeys
      );
    }

    return res.json({ success: true, data: { userId: cleanUserId, name: cleanName } });
  } catch (err) {
    console.error("setupUser error:", err);
    return res.json({ success: false, error: "Server error" });
  }
}

// GET /api/users/:currentUserId
async function getUsers(req, res) {
  try {
    const requestedId = String(req.params.currentUserId || "").trim().toLowerCase();
    const verifiedId  = req.identity?.userId;

    if (!requestedId) return res.json({ success: false, error: "currentUserId is required" });
    if (requestedId !== verifiedId) return res.status(403).json({ success: false, error: "Forbidden" });

    const onlineStore = getAllUsers();
    const sessions    = await getAllSessionsForUser(requestedId);

    const chattedUserIds = new Set();
    const userUnread     = {};

    sessions.forEach((session) => {
      const unread = getUnreadValue(session.unreadCount, requestedId);
      session.participants.forEach((pid) => {
        if (pid === requestedId) return;
        chattedUserIds.add(pid);
        userUnread[pid] = (userUnread[pid] || 0) + unread;
      });
    });

    const fallbackMessages = await Message.find({
      $or: [{ senderId: requestedId }, { receiverId: requestedId }],
    }).select("senderId receiverId").lean();

    fallbackMessages.forEach((m) => {
      if (m.senderId  !== requestedId) chattedUserIds.add(m.senderId);
      if (m.receiverId !== requestedId) chattedUserIds.add(m.receiverId);
    });

    const onlineUsers = Object.keys(onlineStore)
      .filter((id) => id !== requestedId)
      .map((id) => ({ userId: id, name: onlineStore[id].name, online: true, unreadCount: userUnread[id] || 0 }));

    const chattedDocs  = await User.find({ userId: { $in: [...chattedUserIds] } }).lean();
    const offlineUsers = chattedDocs
      .filter((u) => !onlineStore[u.userId] && u.userId !== requestedId)
      .map((u) => ({ userId: u.userId, name: u.name, online: false, unreadCount: userUnread[u.userId] || 0 }));

    return res.json({ success: true, data: [...onlineUsers, ...offlineUsers] });
  } catch (err) {
    console.error("getUsers error:", err);
    return res.json({ success: false, error: "Server error" });
  }
}

module.exports = { setupUser, getUsers };
