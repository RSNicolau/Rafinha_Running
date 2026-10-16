import { ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/** Nome da variável usada por este util (tokens OAuth de integrações). Validada em main.ts → validateEnv. */
export const ENCRYPTION_KEY_ENV = 'ENCRYPTION_KEY';

let warnedMissingKey = false;

/** ENCRYPTION_KEY deve ser 32 bytes em hex (64 caracteres hex). */
export function isValidEncryptionKey(value: string | undefined | null): boolean {
  // Mesmo critério histórico do util: os bytes hex decodificados precisam somar 32
  return typeof value === 'string' && Buffer.from(value, 'hex').length === 32;
}

function getKey(): Buffer | null {
  const key = process.env[ENCRYPTION_KEY_ENV];
  if (!isValidEncryptionKey(key)) return null;
  return Buffer.from(key as string, 'hex');
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns base64-encoded string: iv(16) + authTag(16) + ciphertext.
 *
 * Sem ENCRYPTION_KEY válida:
 *  - produção: lança erro (nunca grava segredo em texto puro silenciosamente);
 *  - dev/test: retorna o texto original e emite um aviso (uma vez).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) {
    if (isProduction()) {
      throw new ServiceUnavailableException(`${ENCRYPTION_KEY_ENV} ausente ou inválida (esperado 64 caracteres hex) — recusando gravar dados sensíveis sem criptografia`);
    }
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      // eslint-disable-next-line no-console
      console.warn(`[encryption] ${ENCRYPTION_KEY_ENV} não configurada — dados sensíveis NÃO estão sendo criptografados (apenas fora de produção).`);
    }
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext (iv + authTag + data).
 * Returns the input unchanged if it isn't a valid ciphertext (legacy plaintext rows from before encryption).
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  if (!key) {
    if (isProduction()) {
      throw new ServiceUnavailableException(`${ENCRYPTION_KEY_ENV} ausente ou inválida — impossível descriptografar`);
    }
    return ciphertext;
  }

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
    // If decryption fails, assume legacy plaintext (backwards compatibility during migration)
    return ciphertext;
  }
}
