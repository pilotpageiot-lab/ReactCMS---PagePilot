import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../../lib/db/pool';
import { escapeHtml } from '../../utils/sanitize';
import { verifyAccessToken } from '../../lib/jwt';
import { config } from '../../config';
import { BadRequestError, UnauthorizedError, NotFoundError, ForbiddenError } from '../../utils/errors';

const router = Router();

router.get('/:websiteId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const websiteId = req.params['websiteId'] as string;
    const token = req.query['token'] as string | undefined;

    if (!websiteId) throw new BadRequestError('websiteId param required');
    if (!token) throw new BadRequestError('token query param required');

    let userId: string;
    try {
      const payload = verifyAccessToken(token);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Verify user is a member of this website
    const { rows: memberRows } = await pool.query(
      'SELECT role FROM website_members WHERE website_id = $1 AND user_id = $2',
      [websiteId, userId],
    );
    if (!memberRows[0]) throw new ForbiddenError('You are not a member of this website');

    // Fetch website info
    const { rows: websiteRows } = await pool.query(
      'SELECT name, slug FROM websites WHERE id = $1 AND is_active = true',
      [websiteId],
    );
    if (!websiteRows[0]) throw new NotFoundError('Website');
    const website = websiteRows[0] as { name: string; slug: string };

    // Fetch content items
    const { rows: contentRows } = await pool.query(
      `SELECT cms_key, content_type, value FROM content_items
       WHERE website_id = $1 ORDER BY cms_key`,
      [websiteId],
    );

    const apiUrl = config.API_BASE_URL;
    const html = buildPreviewHtml(apiUrl, website, contentRows as ContentRow[]);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src * data:; connect-src *; font-src * data:; frame-ancestors *");
    res.send(html);
  } catch (err) { next(err); }
});

interface ContentRow {
  cms_key: string;
  content_type: string;
  value: string | null;
}

function buildPreviewHtml(
  apiUrl: string,
  website: { name: string; slug: string },
  content: ContentRow[],
): string {
  const items = content.map((row) => {
    const key = escapeHtml(row.cms_key);
    const val = row.value ?? '';

    if (row.content_type === 'image') {
      return `<div class="pp-item">
        <span class="pp-label">${key}</span>
        <img data-cms="${key}" src="${escapeHtml(val)}" alt="${key}" />
      </div>`;
    }

    if (row.content_type === 'richtext') {
      return `<div class="pp-item">
        <span class="pp-label">${key}</span>
        <div data-cms="${key}" data-cms-type="html">${val}</div>
      </div>`;
    }

    if (row.content_type === 'json') {
      return `<div class="pp-item">
        <span class="pp-label">${key}</span>
        <pre data-cms="${key}">${escapeHtml(val)}</pre>
      </div>`;
    }

    const tag = key.match(/^h[1-6]-/) ? key.slice(0, 2) : 'p';
    return `<div class="pp-item">
      <span class="pp-label">${key}</span>
      <${tag} data-cms="${key}">${escapeHtml(val)}</${tag}>
    </div>`;
  }).join('\n');

  const empty = content.length === 0
    ? '<div class="pp-empty"><p>No content items yet.</p><p>Add content keys in the dashboard, then reload this preview.</p></div>'
    : '';

  // Content is rendered server-side. The SDK is loaded only for its PagePilot
  // edit-mode module (activated via postMessage from the dashboard parent frame).
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(website.name)} — Preview</title>
  <script src="${escapeHtml(apiUrl)}/sdk/v1/sdk.js"><\/script>
  <script>
    // Content is rendered server-side. Notify parent we are ready.
    document.addEventListener('DOMContentLoaded', function() {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'pagepilot:ready' }, '*');
      }
    });
  <\/script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      line-height: 1.7; color: #1e293b; background: #f8fafc;
      padding: 48px 24px 80px; max-width: 720px; margin: 0 auto;
    }
    .pp-header {
      margin-bottom: 48px; padding-bottom: 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .pp-header h1 { font-size: 22px; font-weight: 700; color: #0f172a; }
    .pp-header p  { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .pp-item { margin-bottom: 28px; }
    .pp-label {
      display: inline-block; font-size: 10px; font-family: 'JetBrains Mono', monospace;
      color: #94a3b8; background: #f1f5f9; padding: 2px 8px; border-radius: 4px;
      margin-bottom: 6px; letter-spacing: 0.02em;
    }
    .pp-item h1 { font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.3; }
    .pp-item h2 { font-size: 22px; font-weight: 600; color: #0f172a; line-height: 1.3; }
    .pp-item h3 { font-size: 18px; font-weight: 600; color: #1e293b; }
    .pp-item h4 { font-size: 16px; font-weight: 600; color: #1e293b; }
    .pp-item p  { font-size: 15px; color: #334155; }
    .pp-item pre { font-size: 12px; background: #f1f5f9; padding: 12px; border-radius: 8px; overflow-x: auto; color: #475569; }
    .pp-item img { max-width: 100%; border-radius: 8px; display: block; }
    .pp-item div[data-cms-type="html"] { font-size: 15px; color: #334155; }
    .pp-item div[data-cms-type="html"] strong { font-weight: 600; }
    .pp-item div[data-cms-type="html"] em { font-style: italic; }
    .pp-item div[data-cms-type="html"] a { color: #2563eb; text-decoration: underline; }
    .pp-empty { text-align: center; padding: 80px 0; color: #94a3b8; }
    .pp-empty p { margin-bottom: 8px; }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
</head>
<body>
  <div class="pp-header">
    <h1>${escapeHtml(website.name)}</h1>
    <p>PagePilot Preview — click any text to edit</p>
  </div>
  ${items}
  ${empty}
</body>
</html>`;
}

export { router as previewRouter };
