const { getUserKeys } = require("../services/key");

// GET /api/keys/:userId
async function getKeys(req, res) {
  try {
    const userId = String(req.params.userId || "").trim().toLowerCase();
    if (!userId) return res.json({ success: false, error: "userId is required" });

    const user = await getUserKeys(userId);

    if (!user || !user.identityPublicKey) {
      return res.json({ success: false, error: "No keys found for user" });
    }

    // Pop the first one-time pre-key (getUserKeys already does the atomic pop)
    const oneTimePreKey =
      user.oneTimePreKeys && user.oneTimePreKeys.length > 0
        ? user.oneTimePreKeys[0]
        : null;

    return res.json({
      success: true,
      data: {
        identityPublicKey:    user.identityPublicKey,
        signedPreKey:         user.signedPreKey,
        signedPreKeySignature: user.signedPreKeySignature,
        oneTimePreKey,
      },
    });
  } catch (err) {
    console.error("getKeys error:", err);
    return res.json({ success: false, error: "Server error" });
  }
}

module.exports = { getKeys };
