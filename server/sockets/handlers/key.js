"use strict";

const { getExistingUser, registerKeys, getUserKeys } = require("../../services/key");
const { isSafeEncodedPayload }                       = require("../../utils/validation");

const MAX_ONE_TIME_KEYS = 100;

module.exports = function registerKeyHandler(socket, io, helpers) {

  socket.on("register_keys", async (payload, ack) => {
    try {
      const id  = socket.data.userId;
      const raw = payload && typeof payload === "object" ? payload : {};

      if (!id) { ack && ack({ error: "Unauthorized" }); return; }

      const identityKey = String(raw.identityPublicKey || "").trim();
      if (!identityKey)                    { ack && ack({ error: "identityPublicKey is required" }); return; }
      if (!isSafeEncodedPayload(identityKey)) { ack && ack({ error: "Invalid identityPublicKey encoding" }); return; }

      const existingUser = await getExistingUser(id);
      if (existingUser && existingUser.identityPublicKey && raw.overwrite !== true) {
        ack && ack({ error: "identityPublicKey already exists. Use overwrite: true to replace." });
        return;
      }

      const rawKeys = Array.isArray(raw.oneTimePreKeys) ? raw.oneTimePreKeys : [];
      if (rawKeys.length > MAX_ONE_TIME_KEYS) {
        ack && ack({ error: `Too many oneTimePreKeys (max ${MAX_ONE_TIME_KEYS})` });
        return;
      }

      const cleanOneTimePreKeys = rawKeys
        .filter((k) => k && k.keyId && k.publicKey)
        .map((k) => ({ keyId: String(k.keyId).trim().slice(0, 64), publicKey: String(k.publicKey).trim() }))
        .filter((k) => isSafeEncodedPayload(k.publicKey));

      await registerKeys(
        id,
        socket.data.name || id,
        identityKey,
        raw.signedPreKey ? String(raw.signedPreKey).trim() : "",
        raw.signature    ? String(raw.signature).trim()    : "",
        cleanOneTimePreKeys
      );

      ack && ack({ ok: true });
    } catch (err) {
      console.error("register_keys error:", err);
      ack && ack({ error: "Server error" });
    }
  });

  socket.on("get_user_keys", async (payload, callback) => {
    try {
      const raw = payload && typeof payload === "object" ? payload : {};
      const id  = String(raw.userId || "").trim().toLowerCase();

      if (!id) { callback && callback({ error: "userId is required" }); return; }

      const user = await getUserKeys(id);
      if (!user || !user.identityPublicKey) { callback && callback(null); return; }

      const poppedKey = user.oneTimePreKeys?.length > 0 ? user.oneTimePreKeys[0] : null;

      callback && callback({
        identityPublicKey:     user.identityPublicKey,
        signedPreKey:          user.signedPreKey,
        signedPreKeySignature: user.signedPreKeySignature,
        oneTimePreKey:         poppedKey,
      });
    } catch (err) {
      console.error("get_user_keys error:", err);
      callback && callback({ error: "Server error" });
    }
  });
};
