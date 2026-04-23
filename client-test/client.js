const io = require("socket.io-client");

const socket = io("http://localhost:3000");

let userName = "";
let userId = "";
let selectedUser = "";
let usersMap = {}; // name → id

console.log("Enter your name:");

process.stdin.once("data", (data) => {
  userName = data.toString().trim();
  userId = userName.toLowerCase(); // ✅ FIX

  socket.emit("register", {
    userId,
    name: userName,
  });

  console.log(`\nWelcome ${userName}`);
  console.log("Commands:");
  console.log("/list → show users");
  console.log("/chat NAME → start chat");
});

// USER LIST
socket.on("user_list", (users) => {
  console.log("\n📋 Users:");

  usersMap = {};

  users.forEach((u) => {
    if (u.userId !== userId) {
      console.log(`${u.name}`);
      usersMap[u.name.toLowerCase()] = u.userId;
    }
  });
});

// RECEIVE MESSAGE
socket.on("receive_message", (data) => {
  console.log(`\n💬 ${data.fromName}: ${data.message}`);
});

// CHAT HISTORY
socket.on("chat_history", (messages) => {
  console.log("\n📜 Chat History:");

  messages.forEach((msg) => {
    console.log(`${msg.sender}: ${msg.text}`);
  });
});

// INPUT HANDLER
process.stdin.on("data", (data) => {
  const input = data.toString().trim();

  // SHOW USERS
  if (input === "/list") {
    socket.emit("get_users");
    return;
  }

  // SELECT USER BY NAME
  if (input.startsWith("/chat ")) {
    const name = input.split(" ")[1].toLowerCase();

    if (!usersMap[name]) {
      console.log("❌ User not found");
      return;
    }

    selectedUser = usersMap[name];

    socket.emit("load_messages", {
      user1: userId,
      user2: selectedUser,
    });

    console.log(`✅ Chatting with: ${name}`);
    return;
  }

  // SEND MESSAGE
  if (selectedUser) {
    socket.emit("send_message", {
      from: userId,
      to: selectedUser,
      message: input,
    });
  } else {
    console.log("⚠️ Select a user first using /chat NAME");
  }
});