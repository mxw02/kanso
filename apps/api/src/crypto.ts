import crypto from 'crypto';

const PREFIX = 'enc:v1:';

function getDerivedKey(): Buffer {
  const rawSecret =
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'kanso-super-secret-jwt-key-change-in-production-2026';
  return crypto.createHash('sha256').update(rawSecret).digest();
}

/**
 * Encrypts sensitive secrets (OAuth client secrets, access tokens) using AES-256-GCM.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.startsWith(PREFIX)) return plaintext;

  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts AES-256-GCM encrypted secrets. Falls back gracefully for legacy unencrypted strings.
 */
export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return '';
  if (!payload.startsWith(PREFIX)) return payload;

  const parts = payload.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }

  const [ivB64, tagB64, dataB64] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
