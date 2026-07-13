const users = {};

function addUser(userId, socketId, name) {
  users[userId] = { socketId, name };
}

function removeUser(userId) {
  delete users[userId];
}

function getUser(userId) {
  return users[userId] || null;
}

function getAllUsers() {
  return users;
}

module.exports = { addUser, removeUser, getUser, getAllUsers };
