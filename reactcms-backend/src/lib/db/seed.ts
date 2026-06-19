/**
 * Development seed — creates a superadmin, a demo user, a website, content
 * items, and an API key so you can test the full flow immediately.
 *
 * Run: npm run db:seed
 */
import { pool } from './pool';
import { hashPassword } from '../../utils/hash';
import { generateApiKey } from '../../utils/hash';
import { logger } from '../logger';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── superadmin ──────────────────────────────────────────────────────────
    const adminHash = await hashPassword('Admin1234!');
    const { rows: adminRows } = await client.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, 'superadmin')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['admin@reactcms.io', 'ReactCMS Admin', adminHash],
    );
    const adminId = adminRows[0].id;
    logger.info('Seeded superadmin', { email: 'admin@reactcms.io' });

    // ── demo user ───────────────────────────────────────────────────────────
    const userHash = await hashPassword('Demo1234!');
    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['demo@example.mu', 'Demo User', userHash],
    );
    const userId = userRows[0].id;
    logger.info('Seeded demo user', { email: 'demo@example.mu' });

    // ── website ─────────────────────────────────────────────────────────────
    const { rows: siteRows } = await client.query(
      `INSERT INTO websites (owner_id, name, slug, plan)
       VALUES ($1, $2, $3, 'pro')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [userId, 'VeloMU Demo', 'velomu-demo'],
    );
    const siteId = siteRows[0].id;
    logger.info('Seeded website', { slug: 'velomu-demo', id: siteId });

    // ── content items ────────────────────────────────────────────────────────
    const contentItems = [
      ['hero-title',    'text',  'Order food, parcels & more',          {}],
      ['hero-subtitle', 'text',  "Mauritius's on-demand super app",     {}],
      ['cta-label',     'text',  'Get started',                         {}],
      ['hero-image',    'image', 'https://cdn.velomu.mu/hero.webp',     { alt: 'VeloMU app', width: 1200, height: 800 }],
      ['about-body',    'richtext', '<p>VeloMU connects Mauritius.</p>', { format: 'html' }],
    ];

    for (const [key, type, value, meta] of contentItems) {
      await client.query(
        `INSERT INTO content_items (website_id, created_by, cms_key, content_type, value, metadata, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (website_id, cms_key) DO UPDATE
           SET value = EXCLUDED.value, is_published = true`,
        [siteId, userId, key, type, value, JSON.stringify(meta)],
      );
    }
    logger.info(`Seeded ${contentItems.length} content items`);

    // ── API key ──────────────────────────────────────────────────────────────
    const { key, prefix, hash } = generateApiKey('read');
    await client.query(
      `INSERT INTO api_keys (website_id, key_hash, key_prefix, label, scope)
       VALUES ($1, $2, $3, $4, 'read')
       ON CONFLICT DO NOTHING`,
      [siteId, hash, prefix, 'Seed read key'],
    );

    await client.query('COMMIT');

    logger.info('');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('Seed complete. Demo credentials:');
    logger.info('  Admin  → admin@reactcms.io  / Admin1234!');
    logger.info('  User   → demo@example.mu    / Demo1234!');
    logger.info(`  API key → ${key}`);
    logger.info(`  Website → velomu-demo (${siteId})`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  logger.error('Seed failed', { error: err.message });
  process.exit(1);
});
