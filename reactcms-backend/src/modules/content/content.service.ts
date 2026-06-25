import { pool, withTransaction, setTenantContext, tenantQuery } from '../../lib/db/pool';
import { NotFoundError } from '../../utils/errors';
import { invalidateKey } from '../../lib/contentCache';
import { redis } from '../../lib/redis';
import { sanitizeHtml } from '../../utils/sanitize';
import { getPlanLimits } from '../../lib/planLimits';
import { fireWebhook } from '../../lib/webhook';
import { logAudit } from '../../lib/audit';

function clearPreviewCache(websiteId: string) {
  redis.del('preview:mirror:' + websiteId).catch(() => {});
}
import type { UpsertContentDto, ListContentQuery, PublishContentDto } from './content.schema';

export async function listContent(websiteId: string, query: ListContentQuery) {
  const conditions = ['ci.website_id = $1'];
  const values: unknown[] = [websiteId];
  let i = 2;

  if (query.type)   { conditions.push(`ci.content_type = $${i++}`); values.push(query.type); }
  if (query.published !== undefined) { conditions.push(`ci.is_published = $${i++}`); values.push(query.published); }
  if (query.search) { conditions.push(`ci.cms_key ILIKE $${i++}`); values.push(`%${query.search}%`); }

  const where = conditions.join(' AND ');
  const offset = (query.page - 1) * query.per_page;

  // SECURITY FIX: use tenantQuery so RLS context is always set
  const [{ rows }, { rows: countRows }] = await Promise.all([
    tenantQuery(websiteId,
      `SELECT id, cms_key, content_type, value, metadata, is_published, version, updated_at
       FROM content_items ci WHERE ${where}
       ORDER BY cms_key ASC LIMIT $${i++} OFFSET $${i}`,
      [...values, query.per_page, offset],
    ),
    tenantQuery(websiteId,
      `SELECT COUNT(*) FROM content_items ci WHERE ${where}`, values),
  ]);

  return {
    data: rows,
    total: parseInt((countRows[0] as any).count, 10),
    page: query.page,
    per_page: query.per_page,
  };
}

export async function getContent(websiteId: string, key: string, draft = false) {
  const publishedFilter = draft ? '' : 'AND is_published = true';
  // SECURITY FIX: use tenantQuery
  const { rows } = await tenantQuery(
    websiteId,
    `SELECT * FROM content_items WHERE website_id = $1 AND cms_key = $2 ${publishedFilter}`,
    [websiteId, key],
  );
  const item = rows[0];
  if (!item) throw new NotFoundError(`Content key "${key}"`);
  return item;
}

export async function upsertContent(
  websiteId: string,
  key: string,
  userId: string,
  dto: UpsertContentDto,
) {
  // SECURITY FIX: sanitize richtext on write, not just on read
  let value = dto.value ?? null;
  if (dto.content_type === 'richtext' && value) {
    value = sanitizeHtml(value);
  }

  return withTransaction(async (client) => {
    await setTenantContext(client, websiteId);

    const existing = await client.query(
      'SELECT id, value, metadata, version FROM content_items WHERE website_id = $1 AND cms_key = $2',
      [websiteId, key],
    );

    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      await client.query(
        `INSERT INTO content_versions (content_item_id, changed_by, value, metadata, version)
         VALUES ($1, $2, $3, $4, $5)`,
        [prev.id, userId, prev.value, prev.metadata, prev.version],
      );
      const { rows } = await client.query(
        `UPDATE content_items
         SET content_type = $1, value = $2, metadata = $3,
             is_published = false, version = version + 1, updated_at = now()
         WHERE id = $4 RETURNING *`,
        [dto.content_type, value, dto.metadata, prev.id],
      );
      await invalidateKey(websiteId, key);
      clearPreviewCache(websiteId);
      logAudit(userId, websiteId, 'update', 'content', key, { content_type: dto.content_type });
      return rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO content_items (website_id, created_by, cms_key, content_type, value, metadata)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [websiteId, userId, key, dto.content_type, value, dto.metadata],
      );
      clearPreviewCache(websiteId);
      logAudit(userId, websiteId, 'create', 'content', key, { content_type: dto.content_type });
      return rows[0];
    }
  });
}

export async function deleteContent(websiteId: string, key: string) {
  // SECURITY FIX: use tenantQuery
  const { rowCount } = await tenantQuery(
    websiteId,
    'DELETE FROM content_items WHERE website_id = $1 AND cms_key = $2',
    [websiteId, key],
  );
  if (!rowCount) throw new NotFoundError(`Content key "${key}"`);
}

export async function publishContent(websiteId: string, key: string, dto: PublishContentDto) {
  if (dto.scheduled_at) {
    const { rows } = await tenantQuery<any>(
      websiteId,
      `UPDATE content_items SET scheduled_at = $3
       WHERE website_id = $1 AND cms_key = $2 RETURNING *`,
      [websiteId, key, dto.scheduled_at],
    );
    if (!rows[0]) throw new NotFoundError(`Content key "${key}"`);
    return rows[0];
  }

  const { rows } = await tenantQuery<any>(
    websiteId,
    `UPDATE content_items SET is_published = true, published_at = now(), scheduled_at = NULL
     WHERE website_id = $1 AND cms_key = $2 RETURNING *`,
    [websiteId, key],
  );
  const item = rows[0];
  if (!item) throw new NotFoundError(`Content key "${key}"`);
  await invalidateKey(websiteId, key);
  clearPreviewCache(websiteId);
  fireWebhook(websiteId, 'content.published', { cms_key: key, value: item.value }).catch(() => {});
  return item;
}

export async function publishScheduledItems(): Promise<number> {
  const { rows } = await pool.query<{ id: string; website_id: string; cms_key: string; value: string }>(
    `UPDATE content_items
     SET is_published = true, published_at = now(), scheduled_at = NULL
     WHERE scheduled_at IS NOT NULL AND scheduled_at <= now() AND is_published = false
     RETURNING id, website_id, cms_key, value`,
  );
  for (const item of rows) {
    await invalidateKey(item.website_id, item.cms_key);
    fireWebhook(item.website_id, 'content.scheduled_publish', { cms_key: item.cms_key, value: item.value }).catch(() => {});
  }
  return rows.length;
}

export async function listVersions(websiteId: string, key: string) {
  const { rows: itemRows } = await tenantQuery(
    websiteId,
    'SELECT id FROM content_items WHERE website_id = $1 AND cms_key = $2',
    [websiteId, key],
  );
  const item = itemRows[0] as any;
  if (!item) throw new NotFoundError(`Content key "${key}"`);

  // Filter history by plan's retention period
  const { rows: wsRows } = await pool.query<{ plan: string }>(
    'SELECT plan FROM websites WHERE id = $1', [websiteId],
  );
  const plan = wsRows[0]?.plan ?? 'free';
  const { historyDays } = getPlanLimits(plan);

  const { rows } = await pool.query(
    `SELECT cv.version, cv.value, cv.metadata, cv.created_at, u.name AS changed_by
     FROM content_versions cv
     LEFT JOIN users u ON u.id = cv.changed_by
     WHERE cv.content_item_id = $1 AND cv.created_at > now() - make_interval(days => $2)
     ORDER BY cv.version DESC`,
    [item.id, historyDays],
  );
  return { data: rows };
}

export async function deleteAll(websiteId: string): Promise<number> {
  const { rowCount } = await tenantQuery(
    websiteId,
    'DELETE FROM content_items WHERE website_id = $1',
    [websiteId],
  );
  return rowCount ?? 0;
}

export async function getExistingKeys(websiteId: string): Promise<string[]> {
  const { rows } = await tenantQuery(
    websiteId,
    'SELECT cms_key FROM content_items WHERE website_id = $1',
    [websiteId],
  );
  return rows.map((r: any) => r.cms_key);
}

export async function importBatch(
  websiteId: string,
  userId: string,
  items: { key: string; value: string; content_type: string }[],
): Promise<{ created: string[]; existing: string[] }> {
  return withTransaction(async (client) => {
    await setTenantContext(client, websiteId);

    const keys = items.map((i) => i.key);
    const { rows: existingRows } = await client.query<{ cms_key: string }>(
      'SELECT cms_key FROM content_items WHERE website_id = $1 AND cms_key = ANY($2::text[])',
      [websiteId, keys],
    );
    const existingSet = new Set(existingRows.map((r) => r.cms_key));

    const created: string[] = [];
    const existing: string[] = [];

    for (const item of items) {
      if (existingSet.has(item.key)) {
        existing.push(item.key);
        continue;
      }

      let value = item.value;
      if (item.content_type === 'richtext' && value) {
        value = sanitizeHtml(value);
      }

      await client.query(
        `INSERT INTO content_items (website_id, created_by, cms_key, content_type, value, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (website_id, cms_key) DO NOTHING`,
        [websiteId, userId, item.key, item.content_type, value, {}],
      );
      created.push(item.key);
    }

    return { created, existing };
  });
}

export async function restoreVersion(
  websiteId: string, key: string, version: number, userId: string,
) {
  return withTransaction(async (client) => {
    await setTenantContext(client, websiteId);
    const { rows: itemRows } = await client.query(
      'SELECT id, value, metadata, version FROM content_items WHERE website_id = $1 AND cms_key = $2',
      [websiteId, key],
    );
    const item = itemRows[0];
    if (!item) throw new NotFoundError(`Content key "${key}"`);

    const { rows: versionRows } = await client.query(
      'SELECT value, metadata FROM content_versions WHERE content_item_id = $1 AND version = $2',
      [item.id, version],
    );
    const target = versionRows[0];
    if (!target) throw new NotFoundError(`Version ${version}`);

    await client.query(
      `INSERT INTO content_versions (content_item_id, changed_by, value, metadata, version)
       VALUES ($1, $2, $3, $4, $5)`,
      [item.id, userId, item.value, item.metadata, item.version],
    );
    const { rows } = await client.query(
      `UPDATE content_items
       SET value = $1, metadata = $2, is_published = false, version = version + 1, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [target.value, target.metadata, item.id],
    );
    return { ...rows[0], restored_from: version };
  });
}
