const crypto = require("crypto");

const isProduction = () => process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const keyMaterial = () => {
  const key = process.env.DATA_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key && isProduction()) {
    const err = new Error("DATA_ENCRYPTION_KEY or SESSION_SECRET is required in production");
    err.statusCode = 500;
    throw err;
  }
  return crypto.createHash("sha256").update(key || "development-data-key").digest();
};

const encryptJson = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const plaintext = Buffer.from(JSON.stringify(value ?? null), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    data: ciphertext.toString("base64url"),
  };
};

const decryptJson = (box) => {
  if (!box || box.alg !== "aes-256-gcm") return null;
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(box.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(box.data, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
};

module.exports = {
  encryptJson,
  decryptJson,
};
