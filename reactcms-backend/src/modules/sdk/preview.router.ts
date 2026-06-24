import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../../lib/db/pool';
import { redis } from '../../lib/redis';
import { escapeHtml } from '../../utils/sanitize';
import { verifyAccessToken } from '../../lib/jwt';
import { config } from '../../config';
import { BadRequestError, UnauthorizedError, NotFoundError, ForbiddenError, AppError } from '../../utils/errors';

const router = Router();

const MIRROR_CACHE_PREFIX = 'preview:mirror:';
const MIRROR_CACHE_TTL = 300; // 5 minutes

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

    // Single query: fetch website + check membership in one round-trip
    const { rows } = await pool.query<{
      name: string; slug: string; custom_domain: string | null; role: string | null;
    }>(
      `SELECT w.name, w.slug, w.custom_domain,
              COALESCE(
                (SELECT wm.role FROM website_members wm WHERE wm.website_id = w.id AND wm.user_id = $2),
                CASE WHEN w.owner_id = $2 THEN 'owner' ELSE NULL END
              ) AS role
       FROM websites w WHERE w.id = $1 AND w.is_active = true`,
      [websiteId, userId],
    );
    if (!rows[0]) throw new NotFoundError('Website');
    if (!rows[0].role) throw new ForbiddenError('You are not a member of this website');
    const website = rows[0];

    const apiUrl = config.API_BASE_URL;
    let html: string;

    if (website.custom_domain) {
      html = await getCachedMirror(websiteId, website.custom_domain, apiUrl);
    } else {
      const { rows: contentRows } = await pool.query(
        `SELECT cms_key, content_type, value FROM content_items
         WHERE website_id = $1 ORDER BY cms_key LIMIT 500`,
        [websiteId],
      );
      html = buildFallbackHtml(apiUrl, website, contentRows as ContentRow[]);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.setHeader('Content-Security-Policy',
      "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; " +
      "img-src * data: blob:; connect-src *; font-src * data:; frame-ancestors *; media-src *");
    res.send(html);
  } catch (err) { next(err); }
});

// ── Mirror mode with Redis cache ─────────────────────────────────────────────

async function getCachedMirror(websiteId: string, siteUrl: string, apiUrl: string): Promise<string> {
  const cacheKey = MIRROR_CACHE_PREFIX + websiteId;

  // Try Redis cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  } catch { /* miss */ }

  // Fetch and transform
  const html = await buildMirrorHtml(siteUrl, apiUrl);

  // Cache for 5 minutes
  redis.set(cacheKey, html, { EX: MIRROR_CACHE_TTL }).catch(() => {});

  return html;
}

async function buildMirrorHtml(siteUrl: string, apiUrl: string): Promise<string> {
  let res: globalThis.Response;
  try {
    res = await fetch(siteUrl, {
      headers: { 'User-Agent': 'ReactCMS-PagePilot/1.0' },
      signal: AbortSignal.timeout(10_000),
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

  html = html.replace(/<script[^>]*data-key\s*=\s*["'][^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '<!-- original SDK removed by PagePilot -->');

  const base = new URL('/', siteUrl).href;
  if (!html.includes('<base')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n  <base href="${escapeHtml(base)}">`);
  }

  // Inject SDK + ready signal (SDK must load BEFORE we send ready so its message listener is registered)
  const injection = `
  <script>
    (function(){
      var s=document.createElement('script');
      s.src="${escapeHtml(apiUrl)}/sdk/v1/sdk.js";
      s.onload=function(){
        if(window.parent!==window) window.parent.postMessage({type:'pagepilot:ready'},'*');
      };
      document.head.appendChild(s);
    })();
  <\/script>
`;

  if (html.includes('</body>')) {
    html = html.replace('</body>', injection + '</body>');
  } else {
    html += injection;
  }

  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');

  return html;
}

// ── Fallback ─────────────────────────────────────────────────────────────────

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
      return `<div class="pp-item"><span class="pp-label">${key}</span><img data-cms="${key}" src="${escapeHtml(val)}" alt="${key}" /></div>`;
    }
    if (row.content_type === 'richtext') {
      return `<div class="pp-item"><span class="pp-label">${key}</span><div data-cms="${key}" data-cms-type="html">${val}</div></div>`;
    }
    if (row.content_type === 'json') {
      return `<div class="pp-item"><span class="pp-label">${key}</span><pre data-cms="${key}">${escapeHtml(val)}</pre></div>`;
    }
    const tag = key.match(/^h[1-6]-/) ? key.slice(0, 2) : 'p';
    return `<div class="pp-item"><span class="pp-label">${key}</span><${tag} data-cms="${key}">${escapeHtml(val)}</${tag}></div>`;
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
  <script>
    (function(){
      var s=document.createElement('script');
      s.src="${escapeHtml(apiUrl)}/sdk/v1/sdk.js";
      s.onload=function(){
        if(window.parent!==window) window.parent.postMessage({type:'pagepilot:ready'},'*');
      };
      document.head.appendChild(s);
    })();
  <\/script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',system-ui,sans-serif;line-height:1.7;color:#e2e8f0;background:#0b1220;padding:48px 24px 80px;max-width:720px;margin:0 auto}
    .pp-header{margin-bottom:48px;padding-bottom:20px;border-bottom:1px solid #1e293b}
    .pp-header h1{font-size:22px;font-weight:700;color:#f1f5f9}
    .pp-header p{font-size:13px;color:#64748b;margin-top:4px}
    .pp-item{margin-bottom:28px}
    .pp-label{display:inline-block;font-size:10px;font-family:monospace;color:#22c55e;background:rgba(34,197,94,0.08);padding:2px 8px;border-radius:4px;margin-bottom:6px;border:1px solid rgba(34,197,94,0.2)}
    .pp-item h1{font-size:28px;font-weight:700;color:#f1f5f9}
    .pp-item h2{font-size:22px;font-weight:600;color:#f1f5f9}
    .pp-item h3{font-size:18px;font-weight:600;color:#e2e8f0}
    .pp-item p{font-size:15px;color:#94a3b8}
    .pp-item pre{font-size:12px;background:#111c2e;padding:12px;border-radius:8px;color:#94a3b8;border:1px solid #1e293b}
    .pp-item img{max-width:100%;border-radius:8px}
    .pp-item div[data-cms-type="html"]{font-size:15px;color:#94a3b8}
    .pp-empty{text-align:center;padding:80px 0;color:#64748b}
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
