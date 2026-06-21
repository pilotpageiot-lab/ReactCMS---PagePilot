import { pool } from '../../lib/db/pool';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import type { CreateWebsiteDto, UpdateWebsiteDto, InviteMemberDto } from './websites.schema';

export async function listWebsites(userId: string) {
  const { rows } = await pool.query(
    `SELECT w.*, 'owner' AS role
     FROM websites w WHERE w.owner_id = $1
     UNION
     SELECT w.*, wm.role
     FROM websites w
     JOIN website_members wm ON wm.website_id = w.id
     WHERE wm.user_id = $1 AND wm.accepted_at IS NOT NULL
     ORDER BY created_at DESC`,
    [userId],
  );
  return { data: rows, total: rows.length };
}

export async function createWebsite(userId: string, dto: CreateWebsiteDto) {
  const { rows } = await pool.query(
    `INSERT INTO websites (owner_id, name, slug, plan)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, dto.name, dto.slug, dto.plan],
  );
  return rows[0];
}

export async function getWebsite(websiteId: string) {
  const { rows } = await pool.query(
    `SELECT w.*,
       (SELECT COUNT(*) FROM content_items WHERE website_id = w.id) AS content_count
     FROM websites w WHERE w.id = $1`,
    [websiteId],
  );
  const website = rows[0];
  if (!website) throw new NotFoundError('Website');
  return website;
}

export async function updateWebsite(websiteId: string, dto: UpdateWebsiteDto) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (dto.name !== undefined) { fields.push(`name = $${i++}`); values.push(dto.name); }
  if (dto.custom_domain !== undefined) { fields.push(`custom_domain = $${i++}`); values.push(dto.custom_domain); }
  if (dto.is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(dto.is_active); }

  if (fields.length === 0) throw new Error('No fields to update');

  fields.push(`updated_at = now()`);
  values.push(websiteId);

  const { rows } = await pool.query(
    `UPDATE websites SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0];
}

export async function deleteWebsite(userId: string, websiteId: string) {
  const { rows } = await pool.query(
    'SELECT owner_id FROM websites WHERE id = $1',
    [websiteId],
  );
  const website = rows[0];
  if (!website) throw new NotFoundError('Website');
  if (website.owner_id !== userId) throw new ForbiddenError('Only the owner can delete a website');

  await pool.query('DELETE FROM websites WHERE id = $1', [websiteId]);
}

export async function listMembers(websiteId: string) {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name, u.email, wm.role, wm.accepted_at
     FROM website_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.website_id = $1`,
    [websiteId],
  );
  return { data: rows };
}

export async function inviteMember(websiteId: string, dto: InviteMemberDto) {
  const { rows: userRows } = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [dto.email],
  );
  const user = userRows[0];
  if (!user) throw new NotFoundError('User with that email');

  const { rows: existing } = await pool.query(
    'SELECT id FROM website_members WHERE website_id = $1 AND user_id = $2',
    [websiteId, user.id],
  );
  if (existing.length > 0) throw new ConflictError('User is already a member');

  const { rows } = await pool.query(
    `INSERT INTO website_members (website_id, user_id, role)
     VALUES ($1, $2, $3) RETURNING *`,
    [websiteId, user.id, dto.role],
  );
  return { invited: true, email: dto.email, role: dto.role, invited_at: rows[0].invited_at };
}

export async function listPendingInvites(userId: string) {
  const { rows } = await pool.query(
    `SELECT wm.id AS invite_id, wm.role, wm.invited_at,
            w.id AS website_id, w.name AS website_name, w.slug,
            u.name AS invited_by_name, u.email AS invited_by_email
     FROM website_members wm
     JOIN websites w ON w.id = wm.website_id
     JOIN users u ON u.id = w.owner_id
     WHERE wm.user_id = $1 AND wm.accepted_at IS NULL
     ORDER BY wm.invited_at DESC`,
    [userId],
  );
  return { data: rows };
}

export async function acceptInvite(userId: string, websiteId: string) {
  const { rows } = await pool.query(
    `UPDATE website_members
     SET accepted_at = now()
     WHERE website_id = $1 AND user_id = $2 AND accepted_at IS NULL
     RETURNING *`,
    [websiteId, userId],
  );
  if (rows.length === 0) throw new NotFoundError('Pending invite');
  return rows[0];
}

export async function declineInvite(userId: string, websiteId: string) {
  const { rows } = await pool.query(
    `DELETE FROM website_members
     WHERE website_id = $1 AND user_id = $2 AND accepted_at IS NULL
     RETURNING id`,
    [websiteId, userId],
  );
  if (rows.length === 0) throw new NotFoundError('Pending invite');
}

export async function removeMember(
  websiteId: string,
  targetUserId: string,
  requestingUserId: string,
) {
  const { rows: websiteRows } = await pool.query(
    'SELECT owner_id FROM websites WHERE id = $1',
    [websiteId],
  );
  if (websiteRows[0]?.owner_id === targetUserId) {
    throw new ForbiddenError('Cannot remove the website owner');
  }
  await pool.query(
    'DELETE FROM website_members WHERE website_id = $1 AND user_id = $2',
    [websiteId, targetUserId],
  );
}
