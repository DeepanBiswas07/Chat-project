# E2EE Chat Backend

A production-ready Node.js + Express + Socket.IO + MongoDB encrypted messaging backend with JWT authentication.

## Features

- **End-to-End Encryption (E2EE)** — encrypted message relay with key exchange support
- **JWT-only authentication** — no dev token fallback, HS256 signed tokens
- **Real-time messaging** — Socket.IO with handshake-level JWT verification
- **Session management** — persistent chat sessions with unread counts
- **Delivery receipts** — sent / delivered / read status tracking
- **Typing indicators** — real-time typing events per session
- **Online presence** — live user online/offline tracking
- **REST APIs** — user setup, session management, message history, key exchange
- **Security hardened** — Helmet CSP, CORS, rate limiting, input validation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v18+ |
| Framework | Express v5 |
| Realtime | Socket.IO v4 |
| Database | MongoDB (Mongoose) |
| Auth | JWT (HS256) via `jsonwebtoken` |
| Security | Helmet, CORS, express-rate-limit |

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in **every value** — especially these three:

| Variable | What to put |
|---|---|
| `SERVER_URL` / `CLIENT_URL` | Your server's IP or domain, e.g. `http://192.168.1.100:3000` |
| `MONGO_URI` | Your MongoDB connection string |
| `JWT_SECRET` | A random 64-character secret (see below) |

**Generate a secure JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the output and paste it as the value of `JWT_SECRET` in `.env`.

### 4. Run

```bash
npm start
```

You should see:
```
🚀 Server running on 0.0.0.0:3000 [production]
✅ MongoDB Connected
```

Open `http://YOUR_SERVER_IP:3000` in a browser to test the UI.

---

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions.

| Variable | Required | Description |
|---|---|---|
| `PORT` | ✅ | Port to listen on (e.g. `3000`) |
| `HOST` | ✅ | Bind address (`0.0.0.0` for all interfaces) |
| `NODE_ENV` | ✅ | Set to `production` |
| `SERVER_URL` | ✅ | Public URL of the server |
| `CLIENT_URL` | ✅ | Same as SERVER_URL for single-server setups |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated allowed CORS origins |
| `JWT_SECRET` | ✅ | 64+ char random secret for signing JWTs |
| `API_RATE_LIMIT` | optional | Max REST requests per IP per 15 min (default: 100) |
| `TRUST_PROXY` | optional | Set to `1` if behind nginx/load balancer |

---

## API Endpoints

All endpoints except `/health`, `/auth/token`, and `GET /api/keys/:userId` require:
```
Authorization: Bearer <jwt>
```

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/token` | None | Get a signed JWT (test UI only) |
| `GET` | `/health` | None | Server health check |

### Users
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/user/setup` | Bearer | Register user + upload E2EE keys |
| `GET` | `/api/users/:userId` | Bearer | Get user list with online status + unread counts |

### Sessions
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/sessions/:userId` | Bearer | Get all sessions for a user |
| `POST` | `/api/sessions` | Bearer | Create a new session between two users |

### Messages
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/messages/:sessionId` | Bearer | Get encrypted message history for a session |

### Keys (E2EE)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/keys/:userId` | None (public) | Fetch public key bundle for key exchange |

---

## Socket.IO Events

All socket connections require a valid JWT in the handshake:

```javascript
const socket = io(SERVER_URL, {
  auth: { token: "<jwt>" }
});
```

The server rejects connections at the handshake level if the token is missing or invalid.

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `register` | `{}` | Register presence after connect |
| `register_keys` | `{ identityPublicKey, signedPreKey, signature, oneTimePreKeys }` | Upload E2EE keys |
| `send_message` | `{ to, sessionId, encryptedmessage, nonce, header, clientId }` | Send encrypted message |
| `message_read` | `{ messageId }` | Mark a message as read |
| `create_session` | `{ to }` | Create a chat session |
| `get_sessions` | — | Request session list |
| `get_users` | — | Request user list |
| `load_messages` | `{ sessionId }` | Load messages for a session |
| `typing_start` | `{ to, sessionId }` | Signal typing started |
| `typing_stop` | `{ to, sessionId }` | Signal typing stopped |
| `logout` | — | Disconnect and remove presence |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `user_list` | `[{ userId, name, online, unreadCount }]` | Updated user list |
| `session_list` | `[{ sessionId, participants, ... }]` | Updated session list |
| `chat_history` | `[message]` | Messages for a session |
| `receive_message` | `message` | Incoming encrypted message |
| `message_status` | `{ messageId, clientId, status }` | Delivery/read receipt |
| `typing_start` | `{ from, sessionId }` | Peer started typing |
| `typing_stop` | `{ from, sessionId }` | Peer stopped typing |

---

## JWT Payload Format

Tokens must be HS256 signed with the `JWT_SECRET` and contain:

```json
{
  "userId": "unique_user_id",
  "name": "Display Name",
  "exp": 1234567890
}
```

- `userId` — normalized to lowercase + trimmed, used as the permanent identity
- `name` — display name, trimmed only

---

## Project Structure

```
├── server/
│   ├── config/         # Database connection
│   ├── controllers/    # Route handler logic
│   ├── middleware/     # apiAuth, socketAuth, errorHandler
│   ├── models/         # Mongoose schemas (User, Session, Message, Key)
│   ├── routes/         # Express routers
│   ├── services/       # Business logic (auth, message, session, key, user)
│   ├── sockets/        # Socket.IO setup + event handlers
│   ├── store/          # In-memory online user store
│   ├── utils/          # Input validation helpers
│   └── server.js       # Entry point
├── public/
│   └── index.html      # Test UI (single-page, no build step)
├── .env.example        # ← copy this to .env and fill in your values
├── .gitignore
└── package.json
```

---

## Security Notes

- `.env` is in `.gitignore` — **never commit it**
- `JWT_SECRET` must be a strong random value — never reuse across projects
- `ALLOWED_ORIGINS` must list your exact frontend origin — wildcards (`*`) are blocked in production
- All identity is derived from the verified JWT — client-provided identity in payloads is ignored
- Messages are stored as encrypted blobs — the server never sees plaintext

---

## License

MIT
