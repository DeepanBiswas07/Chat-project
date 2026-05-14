"use strict";

const { getMessages } = require("../services/message");

// field names match socket handler — do not rename
function formatMessageForClient(msg) {
  return {
    messageId:        msg.messageId,
    sessionId:        msg.sessionId,
    senderId:         msg.senderId,
    receiverId:       msg.receiverId,
    encryptedmessage: msg.encryptedmessage,
    nonce:            msg.nonce,
    header:           msg.header,
    version:          msg.version,
    clientId:         msg.clientId,
    status:           msg.status,
    createdAt:        msg.createdAt,
    sentAt:           msg.sentAt,
    deliveredAt:      msg.deliveredAt,
    readAt:           msg.readAt,
  };
}

// GET /api/messages/:sessionId
async function getMessagesBySession(req, res) {
  try {
    const sessionId  = String(req.params.sessionId || "").trim();
    const verifiedId = req.identity?.userId;

    if (!sessionId)  return res.json({ success: false, error: "sessionId is required" });
    if (!verifiedId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const msgs = await getMessages(sessionId);

    // verify the requester is actually in this conversation
    if (msgs.length > 0) {
      const first = msgs[0];
      if (first.senderId !== verifiedId && first.receiverId !== verifiedId) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }
    }

    return res.json({ success: true, data: msgs.map(formatMessageForClient) });
  } catch (err) {
    console.error("getMessagesBySession error:", err);
    return res.json({ success: false, error: "Server error" });
  }
}

module.exports = { getMessagesBySession };
