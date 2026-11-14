import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Authenticated encryption (AES-256-GCM) for OAuth credentials and short-lived
 * sealed cookies. The key is held outside the database in
 * BUFFER_TOKEN_ENCRYPTION_KEY (32 bytes, base64 or hex encoded).
 *
 * Format: v1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 */

const VERSION = "v1";

export function parseKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("BUFFER_TOKEN_ENCRYPTION_KEY is not configured.");
  const trimmed = raw.trim();
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) key = Buffer.from(trimmed, "hex");
  else key = Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new Error("BUFFER_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or hex).");
  }
  return key;
}

export function encrypt(plaintext: string, key: Buffer, aad?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decrypt(sealed: string, key: Buffer, aad?: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Malformed encrypted value.");
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
