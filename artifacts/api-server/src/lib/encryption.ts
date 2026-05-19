import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.KSEF_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "KSEF_ENCRYPTION_KEY environment variable is required for KSeF token encryption.",
    );
  }
  // Derive a stable 32-byte key from whatever the user provided.
  return createHash("sha256").update(raw, "utf8").digest();
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM. Output is base64 of
 * `iv (12B) | tag (16B) | ciphertext`.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Encrypted payload is malformed (too short).");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function maskToken(token: string): string {
  if (!token) return "";
  const last4 = token.slice(-4);
  return `••••••${last4}`;
}
