const { Router } = require("express");
const { getMessagesBySession } = require("../controllers/message");

const router = Router();

// GET /api/messages/:sessionId  — encrypted message history for a conversation
router.get("/messages/:sessionId", getMessagesBySession);

module.exports = router;
