const { Router } = require("express");
const { setupUser, getUsers } = require("../controllers/user");

const router = Router();

// POST /api/user/setup  — called by main app to register a user + keys
router.post("/user/setup", setupUser);

// GET  /api/users/:currentUserId — sidebar user list with online/offline + unread
router.get("/users/:currentUserId", getUsers);

module.exports = router;
