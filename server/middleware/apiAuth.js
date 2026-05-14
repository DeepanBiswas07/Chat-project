"use strict";

const { verifyAppToken } = require("../services/auth.service");

// Validates Bearer token and attaches req.identity = { userId, name }
async function apiAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    const identity = await verifyAppToken(token);
    req.identity = identity;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
}

module.exports = { apiAuthMiddleware };
