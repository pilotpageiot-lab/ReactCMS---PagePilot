import { Pool, PoolClient } from 'pg';
import { config } from '../../config';
import { logger } from '../logger';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  min: config.DB_POOL_MIN,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('PostgreSQL connected', { host: config.DATABASE_URL.split('@')[1] });
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setTenantContext(client: PoolClient, websiteId: string): Promise<void> {
  await client.query(`SELECT set_config('app.current_website_id', $1, true)`, [websiteId]);
}

/**
 * SECURITY FIX: tenantQuery — sets RLS context on every connection before querying.
 * Use instead of pool.query() for all tenant-scoped tables (content_items, etc.)
 */
export async function tenantQuery<T extends Record<string, unknown>>(
  websiteId: string,
  text: string,
  values?: unknown[],
): Promise<{ rows: T[]; rowCount: number | null }> {
  const client = await pool.connect();
  try {
    await setTenantContext(client, websiteId);
    return client.query<T>(text, values);
  } finally {
    client.release();
  }
}
