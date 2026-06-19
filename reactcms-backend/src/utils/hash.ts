import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config';

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Generate a random API key with a readable prefix */
export function generateApiKey(scope: 'read' | 'write'): {
  key: string;
  prefix: string;
  hash: string;
} {
  const prefix = scope === 'read' ? 'cms_pk' : 'cms_sk';
  const random = crypto.randomBytes(24).toString('base64url');
  const key = `${prefix}_${random}`;
  const displayPrefix = key.slice(0, 12);
  return { key, prefix: displayPrefix, hash: sha256(key) };
}
