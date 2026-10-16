import { ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Segredo usado para criptografar chaves BYOK (coach-brain / users ai-settings) e o segredo TOTP do 2FA.
 * Sem fallback: se API_KEY_ENCRYPTION_SECRET não estiver definida, falha (main.ts também valida no boot).
 * Lido sob demanda (não no import) para não derrubar testes/boot antes do env carregar.
 */
export function getApiKeyEncryptionSecret(): string {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new ServiceUnavailableException('Criptografia de chaves não configurada no servidor (API_KEY_ENCRYPTION_SECRET) — fale com o suporte');
  }
  return secret;
}

function cbcEncrypt(plaintext: string, salt: string): string {
  const key = crypto.scryptSync(getApiKeyEncryptionSecret(), salt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function cbcDecrypt(ciphertext: string, salt: string): string {
  const [ivHex, encHex] = ciphertext.split(':');
  if (!ivHex || !encHex) throw new Error('Ciphertext inválido');
  const key = crypto.scryptSync(getApiKeyEncryptionSecret(), salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

/** BYOK API keys (formato compatível com os registros existentes: salt 'salt'). */
export const encryptApiKey = (plaintext: string) => cbcEncrypt(plaintext, 'salt');
export const decryptApiKey = (ciphertext: string) => cbcDecrypt(ciphertext, 'salt');

/** Segredo TOTP (formato compatível: salt 'totp-salt'). */
export const encryptTotpSecret = (plaintext: string) => cbcEncrypt(plaintext, 'totp-salt');
export const decryptTotpSecret = (ciphertext: string) => cbcDecrypt(ciphertext, 'totp-salt');
