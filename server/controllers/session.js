"use strict";

const { v4: uuidv4 } = require("uuid");
const { getSessionsByUser, deleteEmptySessions, createOrUpdateSession } = require("../services/session");
const Session = require("../models/Session");

function getUnreadValue(unreadCount, userId) {
  if (!unreadCount) return 0;
  if (typeof unreadCount.get === "function") return unreadCount.get(userId) || 0;
  return unreadCount[userId] || 0;
}

function formatSessionForUser(session, currentUserId) {
  return {
    sessionId:            session.sessionId,
    participants:         session.participants,
    encryptedLastMessage: session.encryptedLastMessage || null,
    lastMessageAt:        session.lastMessageAt,
    unreadCount:          getUnreadValue(session.unreadCount, currentUserId),
    createdAt:            session.createdAt,
  };
}

// GET /api/sessions/:userId
async function getSessions(req, res) {
  try {
    const requestedId = String(req.params.userId || "").trim().toLowerCase();
    const verifiedId  = req.identity?.userId;

    if (!requestedId) return res.json({ success: false, error: "userId is required" });
    if (requestedId !== verifiedId) return res.status(403).json({ success: false, error: "Forbidden" });

    await deleteEmptySessions(requestedId);
    const sessions = await getSessionsByUser(requestedId);

    return res.json({ success: true, data: sessions.map((s) => formatSessionForUser(s, requestedId)) });
  } catch (err) {
    console.error("getSessions error:", err);
    return res.json({ success: false, error: "Server error" });
  }
}

// POST /api/sessions
async function createSession(req, res) {
  try {
    const from = req.identity?.userId; // always from token, never from body
    const to   = String(req.body.to || "").trim().toLowerCase();

    if (!from)      return res.status(401).json({ success: false, error: "Unauthorized" });
    if (!to)        return res.json({ success: false, error: "to is required" });
    if (from === to) return res.json({ success: false, error: "Cannot create session with yourself" });

    const existing = await Session.findOne({ participants: { $all: [from, to], $size: 2 } }).lean();
    if (existing) return res.json({ success: true, data: { sessionId: existing.sessionId } });

    const sessionId = uuidv4();
    await createOrUpdateSession(sessionId, from, to, null, false);

    return res.json({ success: true, data: { sessionId } });
  } catch (err) {
    console.error("createSession error:", err);
    return res.json({ success: false, error: "Server error" });
  }
}

module.exports = { getSessions, createSession };
