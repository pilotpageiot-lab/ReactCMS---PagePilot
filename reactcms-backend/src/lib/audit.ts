import { pool } from './db/pool';
import { logger } from './logger';

export async function logAudit(
  userId: string | null,
  websiteId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, website_id, action, entity, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, websiteId, action, entity, entityId ?? null, details ?? {}],
    );
  } catch (err) {
    logger.warn('Failed to write audit log', { error: (err as Error).message });
  }
}

export async function getAuditLog(websiteId: string, limit = 50, offset = 0) {
  const { rows } = await pool.query(
    `SELECT al.*, u.name AS user_name, u.email AS user_email
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.website_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [websiteId, limit, offset],
  );
  return { data: rows };
}
