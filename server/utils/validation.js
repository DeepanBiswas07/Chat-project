function isSafeEncodedPayload(value) {
  return typeof value === "string" && /^[A-Za-z0-9+/=_-]+$/.test(value);
}

function isValidEncryptedPayload({ encryptedmessage, nonce, header }) {
  if (!encryptedmessage || !nonce) return false;
  if (!isSafeEncodedPayload(encryptedmessage) || !isSafeEncodedPayload(nonce)) return false;

  const maxEncryptedMessage = parseInt(process.env.MAX_CIPHERTEXT_BYTES, 10) || 65536;
  const maxNonce = parseInt(process.env.MAX_NONCE_BYTES, 10) || 1024;
  const maxHeader = parseInt(process.env.MAX_HEADER_BYTES, 10) || 16384;

  if (Buffer.byteLength(encryptedmessage, "utf8") > maxEncryptedMessage) return false;
  if (Buffer.byteLength(nonce, "utf8") > maxNonce) return false;

  if (header) {
    if (!isSafeEncodedPayload(header)) return false;
    if (Buffer.byteLength(header, "utf8") > maxHeader) return false;
  }

  return true;
}

function getEncryptedPreview(lastMessagePreview) {
  const preview = String(lastMessagePreview || "").trim();
  const maxPreview = parseInt(process.env.MAX_PREVIEW_BYTES, 10) || 256;

  if (!preview) return "[encrypted]";

  if (Buffer.byteLength(preview, "utf8") > maxPreview) {
    let truncated = preview.substring(0, maxPreview);
    while (Buffer.byteLength(truncated, "utf8") > maxPreview) {
      truncated = truncated.slice(0, -1);
    }
    return truncated;
  }

  return preview;
}

module.exports = {
  isSafeEncodedPayload,
  isValidEncryptedPayload,
  getEncryptedPreview
};
