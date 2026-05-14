"use strict";

// Per-socket sliding window counters, keyed by socketId
const _store = new Map();

function _getCounter(socketId, event, windowMs) {
  if (!_store.has(socketId)) _store.set(socketId, {});
  const counters = _store.get(socketId);
  const now = Date.now();
  if (!counters[event] || now - counters[event].windowStart > windowMs) {
    counters[event] = { count: 0, windowStart: now };
  }
  return counters[event];
}

// Returns a guard fn: guard(socket, ack?) → true if allowed, false if rate limited
function makeSocketRateLimiter(event, maxCalls, windowMs) {
  return function guard(socket, ack) {
    const counter = _getCounter(socket.id, event, windowMs);
    counter.count += 1;
    if (counter.count > maxCalls) {
      if (typeof ack === "function") ack({ error: "Rate limit exceeded. Slow down." });
      return false;
    }
    return true;
  };
}

function cleanupSocket(socketId) {
  _store.delete(socketId);
}

const WINDOW_MS   = parseInt(process.env.SOCKET_RATE_LIMIT_WINDOW_MS, 10) || 10_000;
const MAX_MSGS    = parseInt(process.env.SOCKET_RATE_LIMIT_MESSAGES,  10) || 20;
const MAX_TYPING  = parseInt(process.env.SOCKET_RATE_LIMIT_TYPING,    10) || 30;
const MAX_GENERAL = parseInt(process.env.SOCKET_RATE_LIMIT_GENERAL,   10) || 30;

const messageLimiter = makeSocketRateLimiter("send_message", MAX_MSGS,    WINDOW_MS);
const typingLimiter  = makeSocketRateLimiter("typing",       MAX_TYPING,  WINDOW_MS);
const generalLimiter = makeSocketRateLimiter("general",      MAX_GENERAL, WINDOW_MS);

module.exports = { makeSocketRateLimiter, cleanupSocket, messageLimiter, typingLimiter, generalLimiter };
