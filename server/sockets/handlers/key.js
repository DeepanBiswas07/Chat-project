const { getExistingUser, registerKeys, getUserKeys } = require("../../services/key");

module.exports = function registerKeyHandler(socket, io, helpers) {

  // ================= REGISTER KEYS =================
  socket.on("register_keys", async ({ identityPublicKey, signedPreKey, signature, oneTimePreKeys, overwrite }, ack) => {
    const id = socket.data.userId;
    const identityKey = String(identityPublicKey || "").trim();

    if (!id) { ack && ack({ error: "Unauthorized" }); return; }
    if (!identityKey) { ack && ack({ error: "identityPublicKey is required" }); return; }

    const existingUser = await getExistingUser(id);
    if (existingUser && existingUser.identityPublicKey && overwrite !== true) {
      ack && ack({ error: "identityPublicKey already exists. Use overwrite: true to replace." });
      return;
    }

    const cleanOneTimePreKeys = Array.isArray(oneTimePreKeys)
      ? oneTimePreKeys
          .filter((key) => key && key.keyId && key.publicKey)
          .map((key) => ({
            keyId: String(key.keyId),
            publicKey: String(key.publicKey),
          }))
      : [];

    await registerKeys(
      id,
      socket.data.name || id,
      identityKey,
      signedPreKey,
      signature,
      cleanOneTimePreKeys
    );

    ack && ack({ ok: true });
  });

  // ================= GET USER KEYS =================
  socket.on("get_user_keys", async ({ userId }, callback) => {
    const id = String(userId || "").trim().toLowerCase();

    if (!id) { callback && callback({ error: "userId is required" }); return; }

    const user = await getUserKeys(id);

    if (!user || !user.identityPublicKey) {
      callback && callback(null);
      return;
    }

    const poppedKey =
      user.oneTimePreKeys && user.oneTimePreKeys.length > 0
        ? user.oneTimePreKeys[0]
        : null;

    callback && callback({
      identityPublicKey: user.identityPublicKey,
      signedPreKey: user.signedPreKey,
      signedPreKeySignature: user.signedPreKeySignature,
      oneTimePreKey: poppedKey,
    });
  });
};
