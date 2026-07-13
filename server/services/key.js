const User = require("../models/User");

async function getExistingUser(userId) {
  return User.findOne({ userId }).lean();
}

async function registerKeys(userId, name, identityKey, signedPreKey, signature, oneTimePreKeys) {
  return User.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        identityPublicKey: identityKey,
        signedPreKey: signedPreKey ? String(signedPreKey) : "",
        signedPreKeySignature: signature ? String(signature) : "",
        oneTimePreKeys,
      },
      $setOnInsert: { name },
    },
    { upsert: true }
  );
}

async function getUserKeys(userId) {
  // Pop one OTPk atomically; return the doc state BEFORE the pop
  let user = await User.findOneAndUpdate(
    { userId, "oneTimePreKeys.0": { $exists: true } },
    { $pop: { oneTimePreKeys: -1 } },
    { returnDocument: "before" }
  ).lean();

  if (!user) {
    user = await User.findOne({ userId }).lean();
  }

  return user;
}

module.exports = { getExistingUser, registerKeys, getUserKeys };
