import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../../lib/db/pool';
import { escapeHtml } from '../../utils/sanitize';
import { verifyAccessToken } from '../../lib/jwt';
import { config } from '../../config';
import { BadRequestError, UnauthorizedError, NotFoundError, ForbiddenError, AppError } from '../../utils/errors';

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

    const { rows: memberRows } = await pool.query(
      'SELECT role FROM website_members WHERE website_id = $1 AND user_id = $2',
      [websiteId, userId],
    );
    if (!memberRows[0]) throw new ForbiddenError('You are not a member of this website');

    const { rows: websiteRows } = await pool.query(
      'SELECT name, slug, custom_domain FROM websites WHERE id = $1 AND is_active = true',
      [websiteId],
    );
    if (!websiteRows[0]) throw new NotFoundError('Website');
    const website = websiteRows[0] as { name: string; slug: string; custom_domain: string | null };

    const apiUrl = config.API_BASE_URL;
    let html: string;

    if (website.custom_domain) {
      html = await buildMirrorHtml(website.custom_domain, apiUrl);
    } else {
      const { rows: contentRows } = await pool.query(
        `SELECT cms_key, content_type, value FROM content_items
         WHERE website_id = $1 ORDER BY cms_key`,
        [websiteId],
      );
      html = buildFallbackHtml(apiUrl, website, contentRows as ContentRow[]);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy',
      "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; " +
      "img-src * data: blob:; connect-src *; font-src * data:; frame-ancestors *; media-src *");
    res.send(html);
  } catch (err) { next(err); }
});

// ── Mirror mode: fetch the actual website and inject SDK ─────────────────────

async function buildMirrorHtml(siteUrl: string, apiUrl: string): Promise<string> {
  let res: globalThis.Response;
  try {
    res = await fetch(siteUrl, {
      headers: { 'User-Agent': 'ReactCMS-PagePilot/1.0' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`Could not reach ${siteUrl}: ${msg}`, 422, 'PREVIEW_FETCH_FAILED');
  }

  if (!res.ok) {
    throw new AppError(`Site returned HTTP ${res.status}`, 422, 'PREVIEW_FETCH_FAILED');
  }

  let html = await res.text();

  // Make relative URLs absolute so assets load correctly inside the iframe
  const base = new URL('/', siteUrl).href;
  if (!html.includes('<base')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n  <base href="${escapeHtml(base)}">`);
  }

  // Inject the SDK script + PagePilot ready signal right before </body>
  const injection = `
  <!-- PagePilot V2 — injected by ReactCMS -->
  <script src="${escapeHtml(apiUrl)}/sdk/v1/sdk.js"><\/script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'pagepilot:ready' }, '*');
      }
    });
    if (document.readyState !== 'loading') {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'pagepilot:ready' }, '*');
      }
    }
  <\/script>
`;

  if (html.includes('</body>')) {
    html = html.replace('</body>', injection + '</body>');
  } else {
    html += injection;
  }

  // Remove any existing X-Frame-Options or frame-busting scripts from the source
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');

  return html;
}

// ── Fallback: render content items as a styled page ──────────────────────────

interface ContentRow {
  cms_key: string;
  content_type: string;
  value: string | null;
}

function buildFallbackHtml(
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
    ? '<div class="pp-empty"><p>No content items yet.</p><p>Add content in the dashboard first.</p></div>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(website.name)} — Preview</title>
  <script src="${escapeHtml(apiUrl)}/sdk/v1/sdk.js"><\/script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'pagepilot:ready' }, '*');
      }
    });
  <\/script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif; line-height: 1.7;
      color: #e2e8f0; background: #0b1220;
      padding: 48px 24px 80px; max-width: 720px; margin: 0 auto;
    }
    .pp-header { margin-bottom: 48px; padding-bottom: 20px; border-bottom: 1px solid #1e293b; }
    .pp-header h1 { font-size: 22px; font-weight: 700; color: #f1f5f9; }
    .pp-header p  { font-size: 13px; color: #64748b; margin-top: 4px; }
    .pp-item { margin-bottom: 28px; }
    .pp-label {
      display: inline-block; font-size: 10px; font-family: monospace;
      color: #22c55e; background: rgba(34,197,94,0.08); padding: 2px 8px;
      border-radius: 4px; margin-bottom: 6px; border: 1px solid rgba(34,197,94,0.2);
    }
    .pp-item h1 { font-size: 28px; font-weight: 700; color: #f1f5f9; }
    .pp-item h2 { font-size: 22px; font-weight: 600; color: #f1f5f9; }
    .pp-item h3 { font-size: 18px; font-weight: 600; color: #e2e8f0; }
    .pp-item p  { font-size: 15px; color: #94a3b8; }
    .pp-item pre { font-size: 12px; background: #111c2e; padding: 12px; border-radius: 8px; color: #94a3b8; border: 1px solid #1e293b; }
    .pp-item img { max-width: 100%; border-radius: 8px; }
    .pp-item div[data-cms-type="html"] { font-size: 15px; color: #94a3b8; }
    .pp-empty { text-align: center; padding: 80px 0; color: #64748b; }
  </style>
</head>
<body>
  <div class="pp-header">
    <h1>${escapeHtml(website.name)}</h1>
    <p>PagePilot — click any text to edit</p>
  </div>
  ${items}
  ${empty}
</body>
</html>`;
}

export { router as previewRouter };
