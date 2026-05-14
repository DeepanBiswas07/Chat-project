const { Router } = require("express");
const { getSessions, createSession } = require("../controllers/session");

const router = Router();

// GET  /api/sessions/:userId  — all conversations for a user
router.get("/sessions/:userId", getSessions);

// POST /api/sessions  — create or return an existing session between two users
router.post("/sessions", createSession);

module.exports = router;
