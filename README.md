# Chat Project

A real-time chat application built with Node.js, Socket.IO, MongoDB, and a simple HTML/CSS/JavaScript client.

The app supports user login, online/offline user lists, conversation sessions, message history, message delivery/read status, unread counters, and real-time updates between clients.

## Features

- Real-time messaging with Socket.IO
- MongoDB persistence with Mongoose
- Login by username
- Online and offline user list
- Conversation/session list per user
- Multiple sessions between the same users
- Message history loading by conversation
- Message status indicators:
  - Sent
  - Delivered
  - Read
- Read receipts
- Backend-backed unread counts per conversation
- Aggregated unread counts per user
- Empty draft sessions are not saved until the first message is sent
- Mobile-style chat UI in a single HTML file

## Project Structure

```text
chat-project/
  client-test/
    index.html
  server/
    db.js
    server.js
    models/
      Conversation.js
      Message.js
      User.js
  package.json
  package-lock.json
```

## Requirements

- Node.js
- npm
- MongoDB database connection

## Installation

Install dependencies from the project root:

```bash
npm install
```

## Running the Server

Start the Socket.IO server:

```bash
node server/server.js
```

The server runs on:

```text
http://0.0.0.0:3000
```

The client currently connects to the server from `client-test/index.html` using:

```js
const socket = io("http://192.168.10.215:3000");
```

Update this URL if your server IP address changes.

## Running the Client

Open this file in a browser:

```text
client-test/index.html
```

To test real-time chat, open the client in two browser windows and log in with two different names.

## Main Socket Events

### Client to Server

- `register`
- `get_users`
- `get_conversations`
- `create_conversation`
- `load_messages`
- `send_message`
- `message_read`

### Server to Client

- `user_list`
- `conversation_list`
- `chat_history`
- `receive_message`
- `message_status`

## Unread Count Logic

Unread counts are stored on each conversation in MongoDB:

```js
unreadCount: {
  type: Map,
  of: Number,
  default: {}
}
```

When a message is sent, the receiver's unread count is incremented.

When a message is read, the reader's unread count for that conversation is reset to `0`.

The server sends:

- per-conversation unread count in `conversation_list`
- total unread count per contact in `user_list`

## Database Notes

The MongoDB connection is configured in:

```text
server/db.js
```

Before pushing this project to a public Git repository, move any database credentials into environment variables and avoid committing secrets.

## Development Notes

There is currently no custom npm start script. Use:

```bash
node server/server.js
```

There is also no automated test suite configured yet.

