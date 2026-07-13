# Chat Backend — System Documentation

> A real-time, end-to-end encryption compatible chat backend built with Node.js, Socket.IO, and MongoDB.

---

## 1. Project Overview

This backend powers a real-time chat system designed around an **E2EE-compatible relay model**. The server never sees plaintext messages. It stores only encrypted payloads (ciphertext, nonce, header) and relays them between clients. All encryption and decryption happens exclusively on the client side.

The backend handles:

- Real-time message delivery over persistent WebSocket connections
- Message persistence and status tracking (sent → delivered → read)
- Session management with unread counts
- Presence tracking (online/offline users)
- E2EE key distribution via a Signal Protocol-style prekey bundle API

The system is designed to behave like a production messaging backend — with deduplication, per-user unread tracking, offline delivery, and key exchange — while keeping the server architecturally blind to message content.

---

## 2. Architecture Overview

```
Client (Browser)
     │
     │  WebSocket (Socket.IO)
     ▼
Node.js + Express
     │
     ├── Socket.IO Server       ← real-time event handling
     ├── In-Memory User Store   ← online presence (per process)
     ├── Services Layer         ← all database operations
     └── MongoDB                ← persistent storage
```

### Core Technologies

| Layer | Technology | Role |
|---|---|---|
| Transport | Socket.IO | Persistent bidirectional connection |
| HTTP Server | Node.js + Express | Static file serving, server bootstrap |
| Database | MongoDB via Mongoose | Message, user, and session persistence |
| Presence | In-memory Map (`store/`) | Tracks online sockets per userId |
| Encryption | Client-only | Backend never touches plaintext |

### Design Principles

- **Stateless DB, Stateful Presence** — MongoDB holds all persistent state. The in-memory store holds only which users are currently connected.
- **Event-Driven** — all functionality is triggered by Socket.IO events. There are no REST endpoints for chat operations.
- **E2EE Relay** — the server is a transport layer. It validates structure and size of encrypted payloads but never inspects content.
- **Push + Pull Hybrid** — the server pushes updates (session lists, user lists, message status) after every state-changing event. Clients can also pull on demand.

---

## 3. Folder Structure

```
server/
├── config/
│   └── db.js
├── models/
│   ├── User.js
│   ├── Message.js
│   └── Session.js
├── sockets/
│   ├── index.js
│   └── handlers/
│       ├── auth.js
│       ├── message.js
│       ├── session.js
│       ├── presence.js
│       └── key.js
├── services/
│   ├── user.js
│   ├── message.js
│   ├── session.js
│   └── key.js
├── store/
│   └── onlineUsers.js
├── utils/
│   └── validation.js
└── server.js
```

### Responsibilities

**`server.js`** — Entry point and Express setup. Loads environment, connects to the database, configures middleware (`express.json`, `express.static`), creates the HTTP server, initializes Socket.IO, and starts listening. Contains zero business logic.

**`config/db.js`** — MongoDB connection logic. Handles initial connect, runtime error events, and graceful shutdown on `SIGINT`/`SIGTERM`.

**`models/`** — Mongoose schema definitions. Each model defines the shape of its collection, field constraints, indexes, and defaults. No business logic lives here.

**`sockets/index.js`** — Socket.IO initializer. Creates the `io` instance, defines all broadcast helper functions (which require access to `io`), and wires all handlers on each new connection. The broadcast helpers are passed to handlers via a `helpers` object to avoid circular dependencies.

**`sockets/handlers/`** — One file per domain. Each handler receives `(socket, io, helpers)` and registers socket event listeners. Handlers orchestrate calls to services and broadcast helpers but contain no direct DB access.

**`services/`** — All database operations live here. Handlers call services; services call Mongoose models. This separation ensures handlers stay thin and DB logic stays testable and reusable.

**`store/onlineUsers.js`** — In-memory Map of `userId → { socketId, name }`. Exposes `addUser`, `removeUser`, `getUser`, `getAllUsers`. Used across handlers and helpers to resolve socket IDs for online users. This is process-local (single instance).

**`utils/validation.js`** — Pure validation functions. Validates encrypted payload structure, character safety (base64/URL-safe encoding), and byte-length limits. Used by the message handler before any DB write.

---

## 4. Data Models

### User

```
userId              String    Unique. Lowercased display name used as primary key.
name                String    Display name (original casing).
identityPublicKey   String    Long-term public key (Signal Protocol identity key).
signedPreKey        String    Medium-term signed prekey.
signedPreKeySignature String  Signature over signedPreKey, verifiable by identity key.
oneTimePreKeys      Array     List of { keyId, publicKey }. Consumed one-at-a-time on key fetch.
```

The user document is created on first `register`. Keys are added separately via `register_keys`. One-time prekeys are popped atomically from the array when fetched by another client.

### Message

```
messageId       String    UUID. Unique per message.
sessionId       String    Links message to its session.
senderId        String    userId of the sender.
receiverId      String    userId of the receiver.
encryptedmessage String  The encrypted message body (base64 ciphertext).
nonce           String    Encryption nonce (base64).
header          String    Optional. Ratchet header for Double Ratchet protocol.
version         Number    Protocol version. Defaults to 1.
clientId        String    Client-generated deduplication key.
status          Enum      waiting | sent | delivered | read
sentAt          Date      Set on creation.
deliveredAt     Date      Set when receiver's socket is found online.
readAt          Date      Set when receiver emits message_read.
```

The compound unique index on `{ senderId, clientId }` ensures idempotency — resending the same message (e.g., on reconnect) does not create duplicates.

### Session

```
sessionId              String    UUID. Unique per session.
participants           [String]  Array of two userIds.
createdBy              String    userId of the initiator.
encryptedLastMessage   Object    Encrypted payload of the last message:
  .ciphertext          String    Base64 ciphertext of the last message body.
  .nonce               String    Nonce used to encrypt the last message.
  .header              String    Optional ratchet header of the last message.
lastMessageAt          Date      Timestamp of the last message. Used for sorting.
unreadCount            Map       { userId: Number }. Per-user unread count.
```

`unreadCount` is a Mongoose `Map` type, allowing per-participant tracking: `unreadCount.alice = 3` is independent of `unreadCount.bob = 0`. This enables accurate badge counts without separate documents.

---

## 5. User Flow

```
1. Client opens app
        │
        ▼
2. Socket connects → socket.data.userId = null

3. Client emits: register { name }
        │
        ▼
4. Server:
   - Validates name
   - Checks if userId already in onlineUsers (duplicate login guard)
   - Sets socket.data.userId
   - Calls addUser(userId, socketId, name)  → in-memory
   - Upserts User document in MongoDB       → persistent
   - Sends ack: { userId, name }

5. Client emits: register_keys { identityPublicKey, signedPreKey, ... }
        │
        ▼
6. Server stores keys on User document

7. Server (async, after ack):
   - Broadcasts updated user_list to ALL online users
   - Sends session_list to the newly logged-in user
   - Queries messages where receiverId = userId AND status = "sent"
   - Marks each as "delivered", notifies each sender via message_status
```

The user is now fully online, their session list is populated, and any messages that arrived while they were offline are marked delivered.

---

## 6. Message Flow

```
CLIENT A (Sender)                    SERVER                    CLIENT B (Receiver)
      │                                 │                              │
      │  1. Encrypts message            │                              │
      │     (AES/Signal — client only)  │                              │
      │                                 │                              │
      │── send_message ───────────────▶ │                              │
      │   { to, sessionId,              │                              │
      │     encryptedmessage,           │                              │
      │     nonce, header, clientId }   │                              │
      │                                 │                              │
      │                    2. Validate payload (structure + size)      │
      │                    3. Dedup check: findMessage(senderId, clientId)
      │                    4. Message.create({ status: "sent" })       │
      │                    5. Upsert Session (lastMessage, unread)     │
      │                                 │                              │
      │                    6. Is B online?                             │
      │                       YES ──────┼──── receive_message ───────▶ │
      │                                 │    (full encrypted payload)   │
      │                    7. Update msg status → "delivered"           │
      │                    8. Update msg.deliveredAt                    │
      │                                 │                              │
      │◀── message_status ─────────────  │                              │
      │    { messageId, status: "delivered" }                           │
      │                                 │                              │
      │◀── ack: formatMessageForClient  │                              │
      │    { messageId, status, ... }   │                              │
      │                                 │                              │
      │                    9. Push updated user_list to all             │
      │                   10. Push session_list to A and B             │
      │                                 │                              │
      │                              (B views message)                  │
      │                                 │◀─── message_read ────────── │
      │                    11. Update msg status → "read"               │
      │                    12. Reset unreadCount for B in session      │
      │◀── message_status ─────────────  │                              │
      │    { messageId, status: "read" } │                              │
```

If B is **offline** at step 6, the message stays at status `"sent"`. When B reconnects and emits `register`, the server queries all `sent` messages for B, marks them `delivered`, and notifies each sender.

The server **never decrypts** `encryptedmessage`. It validates encoding and byte length, then stores and relays the payload verbatim.

---

## 7. Session System

Sessions are the primary unit of conversation between two participants. One session document exists per unique exchange, identified by a UUID (`sessionId`).

**Lifecycle:**

1. A new session document is created (via `$setOnInsert`) only when the **first message** is sent to a `sessionId` that doesn't yet exist in the database.
2. Every subsequent message updates `lastMessage`, `lastMessagePreview`, and `lastMessageAt` via `$set`.
3. `deleteEmptySessions` is called before sending a session list. It removes any session records with no `lastMessage` — preventing ghost sessions from appearing in the UI.
4. The session list is sorted by `lastMessageAt` descending — most recent first.

**lastMessagePreview** stores a relay-safe string (e.g., `"[encrypted]"` or a client-provided short preview). The backend never generates this from plaintext.

---

## 8. Unread System

`unreadCount` is stored as a `Map` on the Session document:

```
unreadCount: {
  "alice": 0,
  "bob":   3
}
```

**Increment:** When a new message is created (`isNewMessage = true`), the server runs:
```
$inc: { "unreadCount.bob": 1 }
```
Only the **receiver's** count is incremented. The sender's count is unaffected.

**Reset:** When the receiver emits `message_read`, the server runs:
```
$set: { "unreadCount.bob": 0 }
```
This resets the entire unread count for that user in that session, not just for a single message. This matches how real-world messaging apps behave (opening a chat marks all as read).

**Surface:** The unread count is included in every `session_list` push, formatted per-user before sending. Each client only sees their own unread count for each session.

---

## 9. Presence System

Online presence is tracked in **process memory** using `store/onlineUsers.js`:

```js
{ userId: { socketId, name } }
```

**Connect:**
- A socket connects → `socket.data.userId = null` (anonymous)
- Client emits `register` → `addUser(userId, socketId, name)` adds to the map
- `user_list` is broadcast to all online users

**Disconnect:**
- Socket emits `disconnect` → server checks `socket.data.userId`
- If the user is in the map, `removeUser(userId)` removes them
- `user_list` is broadcast again to reflect the departure

**Logout:**
- Client explicitly emits `logout` → same removal + broadcast, then socket disconnects

**User List Construction:**
The `sendUserList` function builds a list of users relevant to the requesting client:
- **Online users:** all users currently in the in-memory map (excluding self)
- **Offline users:** users who have had a session with the client (queried from Session + Message documents) but are not currently in the map

Each entry includes `online: true/false` and the user's `unreadCount` relative to the requesting client.

---

## 10. E2EE Design

This backend is architected as an **encrypted relay**. The following guarantees are enforced by design:

| Property | Implementation |
|---|---|
| Backend never sees plaintext | Only `encryptedmessage`, `nonce`, `header` are stored — never raw text |
| Payload validation is structure-only | Validates base64 encoding and byte length, not content |
| Key distribution is server-assisted | Public keys stored on server; private keys never leave the client |
| One-time prekeys are consumed atomically | `$pop: { oneTimePreKeys: -1 }` with `returnDocument: "before"` ensures each OTPk is used exactly once |
| Message preview is client-controlled | `lastMessagePreview` is provided by the sender client — the server stores it verbatim without inspection |

**Key Exchange Flow (Signal Protocol-compatible):**

```
1. Alice registers: POST identityPublicKey + signedPreKey + oneTimePreKeys
2. Bob fetches Alice's key bundle: get_user_keys { userId: "alice" }
3. Server pops one OTPk from Alice's bundle, returns the prekey bundle
4. Bob performs X3DH key agreement on the client (no server involvement)
5. Bob encrypts message with derived session key
6. Server relays ciphertext — never participates in key agreement
```

The backend does not implement or enforce any specific E2EE protocol. It provides key storage and retrieval as infrastructure; the cryptographic protocol runs entirely on clients.

---

## 11. Socket Events

### Auth

| Event | Direction | Payload | Description |
|---|---|---|---|
| `register` | Client → Server | `{ name }` | Registers the user on the current socket. Upserts the User document, adds to online map, delivers pending messages. Ack: `{ userId, name }` |
| `logout` | Client → Server | — | Removes user from online map, broadcasts updated user list. |

### Keys

| Event | Direction | Payload | Description |
|---|---|---|---|
| `register_keys` | Client → Server | `{ identityPublicKey, signedPreKey, signature, oneTimePreKeys, overwrite }` | Stores E2EE public keys on the User document. Rejects if keys already exist unless `overwrite: true`. Ack: `{ ok: true }` |
| `get_user_keys` | Client → Server | `{ userId }` | Returns the target user's prekey bundle. Atomically pops one OTPk. Callback: `{ identityPublicKey, signedPreKey, signedPreKeySignature, oneTimePreKey }` |

### Messaging

| Event | Direction | Payload | Description |
|---|---|---|---|
| `send_message` | Client → Server | `{ to, sessionId, encryptedmessage, nonce, header, clientId, lastMessagePreview }` | Validates, deduplicates, stores message, upserts session, delivers to recipient if online, broadcasts lists. Ack: formatted message object. |
| `load_messages` | Client → Server | `{ sessionId }` or `{ user2 }` | Returns all messages in a session ordered by `createdAt`. Emits: `chat_history` |
| `message_read` | Client → Server | `{ messageId }` | Marks message as read, resets unread count, notifies sender. |

### Sessions & Presence

| Event | Direction | Payload | Description |
|---|---|---|---|
| `get_sessions` | Client → Server | — | Returns the caller's session list (sorted, cleaned). Emits: `session_list` |
| `create_session` | Client → Server | `{ to }` | Returns a new UUID-based session descriptor. Does not persist until the first message is sent. |
| `get_users` | Client → Server | — | Returns the caller's relevant user list (online + past contacts). Emits: `user_list` |
| `typing_start` | Client → Server | `{ to, sessionId }` | Forwards typing indicator to recipient if online. |
| `typing_stop` | Client → Server | `{ to, sessionId }` | Forwards typing-stopped indicator to recipient if online. |

### Server-Emitted Events

| Event | Direction | Payload | Description |
|---|---|---|---|
| `receive_message` | Server → Client | Full message object | Pushed to receiver when a message arrives and they are online. |
| `message_status` | Server → Client | `{ messageId, clientId, status }` | Pushed to sender when message status changes (delivered, read). |
| `user_list` | Server → Client | Array of user objects | Pushed after any presence or message event. |
| `session_list` | Server → Client | Array of session objects | Pushed after any event that changes session state. |
| `chat_history` | Server → Client | Array of message objects | Response to `load_messages`. |

---

## 12. Validation & Security

### Payload Validation (`utils/validation.js`)

Every `send_message` call passes through `isValidEncryptedPayload` before any DB write:

1. **Presence check** — `encryptedmessage` and `nonce` must be non-empty strings
2. **Encoding check** — both must match `/^[A-Za-z0-9+/=_-]+$/` (base64/URL-safe characters only)
3. **Size limits** — enforced via `Buffer.byteLength`:
   - `encryptedmessage` ≤ `MAX_CIPHERTEXT_BYTES` (default 65,536 bytes)
   - `nonce` ≤ `MAX_NONCE_BYTES` (default 1,024 bytes)
   - `header` ≤ `MAX_HEADER_BYTES` (default 16,384 bytes)
4. **Header is optional** — if omitted or empty, header validation is skipped entirely

All limits are configurable via environment variables.

### Deduplication

The Message schema enforces a unique compound index on `{ senderId, clientId }`. The `send_message` handler queries for an existing message with the same `(senderId, clientId)` before creating one. This makes `send_message` **idempotent** — safe to retry on reconnect without creating duplicate messages.

### Authorization

Every stateful event handler checks `socket.data.userId` before proceeding. If the socket is not authenticated (user has not emitted `register`), the handler rejects the request immediately.

### No Plaintext Logging

The server never logs `encryptedmessage`, `nonce`, or `header`. Only metadata (userId, sessionId, status) is logged.

### Duplicate Login Prevention

If a userId is already in the online map when `register` is emitted, the server returns `{ error: "User already logged in" }` and rejects the registration — preventing session hijacking over the same username.

---

## 13. System Design Summary

### Behavior

| Scenario | Behavior |
|---|---|
| Recipient is online | Message delivered immediately, status → `delivered` |
| Recipient is offline | Message stored at status `sent`; delivered on next `register` |
| Sender retries send | Dedup by `clientId` prevents duplicates |
| User navigates back | Server pushes fresh `session_list` after every message event |
| Multiple logins same user | Rejected — one active socket per userId |

### What Makes It Secure

- Server stores **only ciphertext** — a database breach exposes no readable messages
- Key material is **public key only** — private keys never touch the server
- OTPks are consumed atomically — prevents key reuse across sessions
- Payload validation rejects malformed or oversized inputs before any DB write
- Per-event auth checks prevent unauthenticated socket abuse

### What Makes It Scalable (Single Instance)

- MongoDB handles all persistence — the server process holds no message state
- In-memory presence store is the only stateful component (requires sticky sessions or Redis for horizontal scale)
- All broadcast helpers are event-driven, not polling-based
- Mongoose lean queries (`{ lean: true }`) are used for read-heavy list operations to reduce memory overhead

### Real-World Behaviors Implemented

- Offline message queuing and delivery-on-reconnect
- Per-user unread count per session
- Typing indicators forwarded peer-to-peer via server relay
- Session cleanup (empty sessions auto-deleted)
- Message status lifecycle with timestamps at each state transition
- Session deduplication (one session per participant pair per UUID)
