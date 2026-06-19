import { pool } from './pool';
import { logger } from '../logger';

const migrations: { name: string; sql: string }[] = [
  {
    name: '001_create_users',
    sql: `
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS users (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email             TEXT UNIQUE NOT NULL,
        name              TEXT NOT NULL,
        password_hash     TEXT,
        role              TEXT NOT NULL DEFAULT 'user'
                          CHECK (role IN ('superadmin', 'user')),
        email_verified_at TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    `,
  },
  {
    name: '002_create_websites',
    sql: `
      CREATE TABLE IF NOT EXISTS websites (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        name          TEXT NOT NULL,
        slug          TEXT UNIQUE NOT NULL,
        custom_domain TEXT UNIQUE,
        plan          TEXT NOT NULL DEFAULT 'free'
                      CHECK (plan IN ('free', 'pro', 'enterprise')),
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_websites_owner  ON websites (owner_id);
      CREATE INDEX IF NOT EXISTS idx_websites_slug   ON websites (slug);
      CREATE INDEX IF NOT EXISTS idx_websites_domain ON websites (custom_domain)
        WHERE custom_domain IS NOT NULL;
    `,
  },
  {
    name: '003_create_website_members',
    sql: `
      CREATE TABLE IF NOT EXISTS website_members (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        website_id  UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
        user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
        role        TEXT NOT NULL DEFAULT 'editor'
                    CHECK (role IN ('admin', 'editor', 'viewer')),
        invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        accepted_at TIMESTAMPTZ,
        UNIQUE (website_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_members_website ON website_members (website_id);
      CREATE INDEX IF NOT EXISTS idx_members_user    ON website_members (user_id);
    `,
  },
  {
    name: '004_create_content_items',
    sql: `
      CREATE TABLE IF NOT EXISTS content_items (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        website_id    UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
        created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        cms_key       TEXT NOT NULL,
        content_type  TEXT NOT NULL DEFAULT 'text'
                      CHECK (content_type IN ('text', 'richtext', 'image', 'json')),
        value         TEXT,
        metadata      JSONB NOT NULL DEFAULT '{}',
        is_published  BOOLEAN NOT NULL DEFAULT false,
        version       INTEGER NOT NULL DEFAULT 1,
        published_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (website_id, cms_key)
      );

      ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

      CREATE POLICY tenant_isolation ON content_items
        USING (website_id = current_setting('app.current_website_id', true)::uuid);

      CREATE INDEX IF NOT EXISTS idx_content_website   ON content_items (website_id);
      CREATE INDEX IF NOT EXISTS idx_content_key       ON content_items (website_id, cms_key);
      CREATE INDEX IF NOT EXISTS idx_content_published ON content_items (website_id, is_published);
    `,
  },
  {
    name: '005_create_content_versions',
    sql: `
      CREATE TABLE IF NOT EXISTS content_versions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
        changed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
        value           TEXT,
        metadata        JSONB NOT NULL DEFAULT '{}',
        version         INTEGER NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_versions_item   ON content_versions (content_item_id);
      CREATE INDEX IF NOT EXISTS idx_versions_item_v ON content_versions (content_item_id, version DESC);
    `,
  },
  {
    name: '006_create_api_keys',
    sql: `
      CREATE TABLE IF NOT EXISTS api_keys (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        website_id   UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
        key_hash     TEXT UNIQUE NOT NULL,
        key_prefix   TEXT NOT NULL,
        label        TEXT NOT NULL,
        scope        TEXT NOT NULL DEFAULT 'read'
                     CHECK (scope IN ('read', 'write')),
        last_used_at TIMESTAMPTZ,
        expires_at   TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_apikeys_website ON api_keys (website_id);
      CREATE INDEX IF NOT EXISTS idx_apikeys_hash    ON api_keys (key_hash);
    `,
  },
  {
    name: '007_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
];

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM _migrations',
    );
    const applied = new Set(rows.map((r) => r.name));

    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      logger.info(`Applying migration: ${migration.name}`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [
          migration.name,
        ]);
        await client.query('COMMIT');
        logger.info(`Migration applied: ${migration.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    logger.info('All migrations up to date');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  logger.error('Migration failed', { error: err.message });
  process.exit(1);
});
