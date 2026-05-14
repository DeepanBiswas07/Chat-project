"use strict";

const { verifyAppToken } = require("../services/auth.service");

// Runs before connection — rejects unauthenticated sockets at the handshake level
async function socketAuthMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    const identity = await verifyAppToken(token);
    socket.data.userId = identity.userId;
    socket.data.name   = identity.name;
    next();
  } catch (err) {
    const error  = new Error("UNAUTHORIZED");
    error.data   = { message: "Provide a valid token in socket.handshake.auth.token" };
    next(error);
  }
}

module.exports = { socketAuthMiddleware };
