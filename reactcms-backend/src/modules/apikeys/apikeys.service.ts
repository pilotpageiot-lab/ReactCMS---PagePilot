import { pool } from '../../lib/db/pool';
import { generateApiKey } from '../../utils/hash';
import { NotFoundError } from '../../utils/errors';
import type { ApiKeyScope } from '../../types';

interface CreateKeyDto {
  label: string;
  scope: ApiKeyScope;
  expires_at?: string | null;
}

export async function listKeys(websiteId: string) {
  const { rows } = await pool.query(
    `SELECT id, label, key_prefix, scope, last_used_at, expires_at, created_at
     FROM api_keys WHERE website_id = $1 ORDER BY created_at DESC`,
    [websiteId],
  );
  return { data: rows };
}

export async function createKey(websiteId: string, dto: CreateKeyDto) {
  const { key, prefix, hash } = generateApiKey(dto.scope);

  const { rows } = await pool.query(
    `INSERT INTO api_keys (website_id, key_hash, key_prefix, label, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, label, key_prefix, scope, created_at`,
    [websiteId, hash, prefix, dto.label, dto.scope, dto.expires_at ?? null],
  );

  // Full key returned only once
  return { ...rows[0], key };
}

export async function revokeKey(websiteId: string, keyId: string) {
  const { rowCount } = await pool.query(
    'DELETE FROM api_keys WHERE id = $1 AND website_id = $2',
    [keyId, websiteId],
  );
  if (!rowCount) throw new NotFoundError('API key');
}
