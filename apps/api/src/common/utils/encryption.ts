import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return Buffer.alloc(0);
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns base64-encoded string: iv(16) + authTag(16) + ciphertext
 * Returns the original string if ENCRYPTION_KEY is not set.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (key.length !== 32) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext (iv + authTag + data).
 * Returns original plaintext if ENCRYPTION_KEY is not set or input is not encrypted.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  if (key.length !== 32) return ciphertext;

  try {
    const data = Buffer.from(ciphertext, 'base64');
    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return ciphertext;

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    // If decryption fails, assume plaintext (for backwards compatibility during migration)
    return ciphertext;
  }
}
