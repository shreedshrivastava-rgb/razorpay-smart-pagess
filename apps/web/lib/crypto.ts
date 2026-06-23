import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM encryption for credentials at rest (Razorpay key secrets / OAuth
// tokens). The key comes from CREDENTIALS_ENC_KEY (64 hex chars = 32 bytes).
// Stored format: base64(iv).base64(authTag).base64(ciphertext)

function getKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENC_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("CREDENTIALS_ENC_KEY must be set to a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecret(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.CREDENTIALS_ENC_KEY && process.env.CREDENTIALS_ENC_KEY.length === 64);
}
