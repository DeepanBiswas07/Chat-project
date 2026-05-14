const { Router } = require("express");
const { getKeys } = require("../controllers/key");

const router = Router();

// GET /api/keys/:userId  — fetch E2EE public keys for key exchange
router.get("/keys/:userId", getKeys);

module.exports = router;
