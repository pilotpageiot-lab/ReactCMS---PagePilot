import { pool } from './db/pool';
import { logger } from './logger';

export async function fireWebhook(websiteId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const { rows } = await pool.query<{ webhook_url: string | null }>(
    'SELECT webhook_url FROM websites WHERE id = $1',
    [websiteId],
  );
  const url = rows[0]?.webhook_url;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PagePilot-Event': event },
      body: JSON.stringify({ event, website_id: websiteId, timestamp: new Date().toISOString(), ...payload }),
      signal: AbortSignal.timeout(10_000),
    });
    logger.info('Webhook delivered', { websiteId, event, url });
  } catch (err) {
    logger.warn('Webhook delivery failed', { websiteId, event, url, error: (err as Error).message });
  }
}
