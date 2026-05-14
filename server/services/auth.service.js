"use strict";

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET is not defined.");
  process.exit(1);
}

// Returns { userId, name } or throws.
// Verifies JWT tokens only.
async function verifyAppToken(token) {
  if (!token || typeof token !== "string" || token.trim() === "") {
    throw new Error("Missing or invalid token");
  }

  const cleaned = token.trim();

  let payload;
  try {
    payload = jwt.verify(cleaned, JWT_SECRET, { algorithms: ["HS256"] });
  } catch (err) {
    throw new Error("Token verification failed: " + err.message);
  }

  const userId = String(payload.userId || "").trim().toLowerCase();
  const name   = String(payload.name || "").trim();

  if (!userId) throw new Error("Token payload missing userId");
  if (!name)   throw new Error("Token payload missing name");

  return { userId, name };
}

module.exports = { verifyAppToken };
