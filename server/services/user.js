const User = require("../models/User");

async function createOrUpdateUser(userId, name) {
  return User.findOneAndUpdate(
    { userId },
    { name },
    { upsert: true, returnDocument: "after" }
  );
}

async function getUser(userId) {
  return User.findOne({ userId }).lean();
}

async function updateUser(userId, data) {
  return User.findOneAndUpdate({ userId }, data, { upsert: true, returnDocument: "after" });
}

module.exports = { createOrUpdateUser, getUser, updateUser };
