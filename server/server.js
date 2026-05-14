"use strict";

require("dotenv").config();

const http = require("http");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { connectDB } = require("./config/db");
const { initSocket } = require("./sockets");
const { apiAuthMiddleware } = require("./middleware/apiAuth");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const jwt = require("jsonwebtoken");

const userRoutes = require("./routes/user");
const sessionRoutes = require("./routes/session");
const messageRoutes = require("./routes/message");
const keyRoutes = require("./routes/key");

const isProduction = process.env.NODE_ENV === "production";

function buildAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || process.env.CORS_ORIGIN || "";
  if (!raw || raw.trim() === "*") {
    if (isProduction) {
      console.warn("⚠️  ALLOWED_ORIGINS is '*' in production — blocking all origins. Set ALLOWED_ORIGINS.");
      return [];
    }
    return "*";
  }
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

const corsOptions = {
  origin: buildAllowedOrigins(),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200,
};

const API_RATE_LIMIT = parseInt(process.env.API_RATE_LIMIT, 10) || 100;

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: API_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." },
});

// stricter limit for user setup
const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many setup attempts. Try again later." },
});

// separate limit for key fetches
const keyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many key requests. Slow down." },
});

const app = express();

const trustProxy = process.env.TRUST_PROXY || (isProduction ? 1 : false);
if (trustProxy) app.set("trust proxy", trustProxy);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
      scriptSrcAttr: ["'unsafe-inline'"],
      connectSrc:    ["'self'", "ws:", "wss:", "http:", "https:"],
      styleSrc:      ["'self'", "'unsafe-inline'"],
      imgSrc:        ["'self'", "data:"],
      fontSrc:       ["'self'"],
      objectSrc:     ["'none'"],
      frameAncestors:["'none'"],
    },
  },
  strictTransportSecurity: false,
  crossOriginOpenerPolicy: false,
}));
app.use(compression());
app.use(morgan(isProduction ? "combined" : "dev", { skip: (req) => req.url === "/health" }));
app.use(cors(corsOptions));
app.options("/{*path}", cors(corsOptions));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV || "development" });
});

app.get("/env.js", (_req, res) => {
  res.type("application/javascript");
  res.send(`window.ENV = { SERVER_URL: "${process.env.SERVER_URL || ""}" };`);
});

app.use(express.static("public"));

// Issues a signed JWT for the test UI — client never holds JWT_SECRET
app.post("/auth/token", (req, res) => {
  try {
    const { userId, name } = req.body || {};
    const cleanUserId = String(userId || "").trim().toLowerCase();
    const cleanName   = String(name   || "").trim();
    if (!cleanUserId || !cleanName) {
      return res.status(400).json({ success: false, error: "userId and name are required" });
    }
    const token = jwt.sign(
      { userId: cleanUserId, name: cleanName },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "24h" }
    );
    return res.json({ success: true, token });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Token generation failed" });
  }
});

// /api/keys is public read — all other routes require a Bearer token
app.use("/api", setupLimiter, apiAuthMiddleware, userRoutes);
app.use("/api", generalLimiter, apiAuthMiddleware, userRoutes);
app.use("/api", generalLimiter, apiAuthMiddleware, sessionRoutes);
app.use("/api", generalLimiter, apiAuthMiddleware, messageRoutes);
app.use("/api", keyLimiter, keyRoutes);

app.use(notFound);
app.use(errorHandler);

connectDB();

const server = http.createServer(app);
initSocket(server);

const port = process.env.PORT;
const host = process.env.HOST;
const jwtSecret = process.env.JWT_SECRET;

if (!port || !host || !jwtSecret) {
  console.error("❌ Missing PORT, HOST, or JWT_SECRET in .env");
  process.exit(1);
}

server.listen(port, host, () => {
  console.log(`🚀 Server running on ${host}:${port} [${process.env.NODE_ENV || "development"}]`);
});
