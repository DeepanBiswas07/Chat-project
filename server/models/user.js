const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },

  identityPublicKey: { type: String },
  signedPreKey: String,
  signedPreKeySignature: String,
  oneTimePreKeys: [
    {
      keyId: String,
      publicKey: String,
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
