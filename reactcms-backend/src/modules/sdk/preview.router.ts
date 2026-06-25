import { Router, Request, Response, NextFunction } from 'express';
import * as cheerio from 'cheerio';
import { pool } from '../../lib/db/pool';
import { redis } from '../../lib/redis';
import { escapeHtml } from '../../utils/sanitize';
import { verifyAccessToken } from '../../lib/jwt';
import { BadRequestError, UnauthorizedError, NotFoundError, ForbiddenError, AppError } from '../../utils/errors';

// Inline PagePilot edit module — no external SDK dependency.
// This is injected directly into preview HTML so editing works even if the
// SDK script fails to load (Render cold starts, network issues, etc.)
const INLINE_PAGEPILOT = `
(function(){
  var A='data-cms',active=false,editing=null,toolbar=null,styleEl=null,handlers=[],
      undoStack=[],redoStack=[],
      TEXT_TAGS='h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,td,th,blockquote,figcaption,small,strong,em,b,i,u,legend,dt,dd,summary,caption',
      SKIP={script:1,style:1,noscript:1,svg:1,head:1,template:1,nav:1};

  function isEditable(el){var t=el.tagName.toLowerCase();if(t==='img')return true;if(t==='video'||t==='audio'||t==='iframe')return false;var m=el.getAttribute('data-cms-type');if(m==='href'||m==='attr'||m==='value')return false;return true}
  function isImage(el){return el.tagName.toLowerCase()==='img'||el.getAttribute('data-cms-type')==='src'}
  function isRich(el){var m=el.getAttribute('data-cms-type');if(m==='html')return true;var ch=el.children;for(var i=0;i<ch.length;i++){var t=ch[i].tagName.toLowerCase();if('strong,em,a,b,i,u,br,span'.indexOf(t)>=0)return true}return false}

  function activate(){
    if(active)return;active=true;injectStyles();
    var usedKeys={},count=0;
    var tagged=document.querySelectorAll('['+A+']');
    for(var i=0;i<tagged.length;i++){var el=tagged[i];if(!isEditable(el))continue;usedKeys[el.getAttribute(A)]=1;count++;attach(el)}
    var all=document.querySelectorAll(TEXT_TAGS);
    for(var j=0;j<all.length;j++){var tel=all[j];if(tel.hasAttribute(A)||!isEditable(tel))continue;var skip=false,p=tel.parentElement;while(p){if(SKIP[p.tagName.toLowerCase()]){skip=true;break}p=p.parentElement}if(skip)continue;var text=(tel.textContent||'').trim();if(text.length<2)continue;if(tel.querySelector(TEXT_TAGS)&&tel.querySelector(TEXT_TAGS).textContent.trim().length>=2)continue;var tag=tel.tagName.toLowerCase(),slug=text.toLowerCase().replace(/[^a-z0-9\\s-]/g,'').replace(/\\s+/g,'-').replace(/-+/g,'-').slice(0,50),key=slug.length>=3?(tag+'-'+slug):(tag+'-auto-'+j);if(usedKeys[key]){var s=2;while(usedKeys[key+'-'+s])s++;key=key+'-'+s}usedKeys[key]=1;tel.setAttribute(A,key);count++;attach(tel)}
    if(window.parent!==window)window.parent.postMessage({type:'pagepilot:elements',count:count},'*');
  }

  function attach(el){
    function enter(){if(editing!==el)el.classList.add('pp-hover')}
    function leave(){el.classList.remove('pp-hover')}
    function click(e){e.preventDefault();e.stopPropagation();startEdit(el)}
    el.addEventListener('mouseenter',enter);el.addEventListener('mouseleave',leave);el.addEventListener('click',click);
    handlers.push({el:el,enter:enter,leave:leave,click:click});
  }

  function startEdit(el){
    if(editing)cancelEdit();
    if(isImage(el)){el._o=el.getAttribute('src')||'';el._img=true;el._r=false}else{var r=isRich(el);el._o=r?el.innerHTML:el.textContent;el._r=r;el._img=false}
    el.classList.remove('pp-hover');el.classList.add('pp-editing');
    if(el._img){showImageBar(el)}else{el.contentEditable='true';el.focus();showBar(el)}
    editing=el;
  }

  function saveEdit(ov){
    var el=editing;if(!el)return;var key=el.getAttribute(A),nv,ct;
    if(el._img){nv=ov||el.getAttribute('src')||'';ct='image';if(ov)el.setAttribute('src',ov)}else{nv=el._r?el.innerHTML:el.textContent;ct=el._r?'richtext':'text';el.contentEditable='false'}
    el.classList.remove('pp-editing');el.classList.add('pp-saved');setTimeout(function(){el.classList.remove('pp-saved')},800);hideBar();editing=null;
    if(nv!==el._o){undoStack.push({el:el,key:key,oldVal:el._o,newVal:nv,rich:el._r,image:el._img});redoStack=[];if(window.parent!==window)window.parent.postMessage({type:'pagepilot:change',key:key,value:nv,content_type:ct,original:el._o},'*')}
  }

  function cancelEdit(){var el=editing;if(!el)return;if(el._img)el.setAttribute('src',el._o);else if(el._r)el.innerHTML=el._o;else el.textContent=el._o;if(!el._img)el.contentEditable='false';el.classList.remove('pp-editing');hideBar();editing=null}

  function showBar(el){
    if(toolbar)hideBar();var key=el.getAttribute(A)||'';var bar=document.createElement('div');bar.id='pp-toolbar';
    bar.innerHTML='<span style="font-size:10px;font-family:monospace;color:#22c55e;background:rgba(34,197,94,0.1);padding:3px 8px;border-radius:5px;border:1px solid rgba(34,197,94,0.25);margin-right:8px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+key+'</span><button id="pp-save" style="background:#22c55e;color:#0b1220;border:none;padding:5px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;">Save</button><button id="pp-cancel" style="background:rgba(255,255,255,0.06);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);padding:5px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;margin-left:6px;font-family:system-ui,sans-serif;">Cancel</button>';
    document.body.appendChild(bar);toolbar=bar;
    document.getElementById('pp-save').addEventListener('click',function(e){e.stopPropagation();saveEdit()});
    document.getElementById('pp-cancel').addEventListener('click',function(e){e.stopPropagation();cancelEdit()});
    posBar(el);var rp=function(){if(editing===el)posBar(el)};window.addEventListener('scroll',rp,true);window.addEventListener('resize',rp);bar._c=function(){window.removeEventListener('scroll',rp,true);window.removeEventListener('resize',rp)};
  }

  function showImageBar(el){
    if(toolbar)hideBar();var key=el.getAttribute(A)||'',src=el.getAttribute('src')||'';var bar=document.createElement('div');bar.id='pp-toolbar';
    bar.innerHTML='<span style="font-size:10px;font-family:monospace;color:#22c55e;background:rgba(34,197,94,0.1);padding:3px 8px;border-radius:5px;border:1px solid rgba(34,197,94,0.25);margin-right:8px;white-space:nowrap;">'+key+'</span><input id="pp-img-url" type="url" value="'+src.replace(/"/g,'&quot;')+'" placeholder="Image URL" style="flex:1;min-width:180px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:5px 10px;font-size:12px;color:#e2e8f0;font-family:system-ui,sans-serif;outline:none;" /><button id="pp-save" style="background:#22c55e;color:#0b1220;border:none;padding:5px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;margin-left:6px;">Save</button><button id="pp-cancel" style="background:rgba(255,255,255,0.06);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);padding:5px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;margin-left:6px;font-family:system-ui,sans-serif;">Cancel</button>';
    document.body.appendChild(bar);toolbar=bar;
    document.getElementById('pp-save').addEventListener('click',function(e){e.stopPropagation();saveEdit(document.getElementById('pp-img-url').value)});
    document.getElementById('pp-cancel').addEventListener('click',function(e){e.stopPropagation();cancelEdit()});
    document.getElementById('pp-img-url').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();document.getElementById('pp-save').click()}});
    document.getElementById('pp-img-url').focus();posBar(el);
    var rp=function(){if(editing===el)posBar(el)};window.addEventListener('scroll',rp,true);window.addEventListener('resize',rp);bar._c=function(){window.removeEventListener('scroll',rp,true);window.removeEventListener('resize',rp)};
  }

  function posBar(el){if(!toolbar)return;var r=el.getBoundingClientRect();toolbar.style.position='fixed';toolbar.style.top=Math.max(8,r.top-42)+'px';toolbar.style.left=r.left+'px';toolbar.style.zIndex='2147483647'}
  function hideBar(){if(!toolbar)return;if(toolbar._c)toolbar._c();if(toolbar.parentNode)toolbar.parentNode.removeChild(toolbar);toolbar=null}

  function injectStyles(){
    if(styleEl)return;var s=document.createElement('style');s.id='pp-styles';
    s.textContent='[data-cms]{cursor:pointer!important;transition:outline .15s ease,box-shadow .15s ease}[data-cms].pp-hover{outline:2px dashed #22c55e;outline-offset:3px;position:relative}[data-cms].pp-hover::after{content:attr(data-cms);position:absolute;top:-20px;left:0;font-size:9px;font-family:monospace;color:#22c55e;background:#0b1220;padding:1px 6px;border-radius:3px;border:1px solid rgba(34,197,94,0.3);pointer-events:none;white-space:nowrap;z-index:2147483646}[data-cms].pp-editing{outline:2px solid #22c55e;outline-offset:3px;box-shadow:0 0 0 4px rgba(34,197,94,0.15);cursor:text!important}[data-cms].pp-editing::after{display:none}[data-cms].pp-saved{animation:pp-flash .8s ease}@keyframes pp-flash{0%{background:rgba(34,197,94,0.2)}100%{background:transparent}}#pp-toolbar{display:flex;align-items:center;padding:6px 8px;background:#0b1220;border:1px solid #1e293b;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.6)}#pp-toolbar button:hover{filter:brightness(1.1)}';
    document.head.appendChild(s);styleEl=s;
  }

  window.addEventListener('message',function(e){var d=e.data;if(!d||typeof d.type!=='string')return;if(d.type==='pagepilot:init')activate();if(d.type==='pagepilot:deactivate'){if(editing)cancelEdit();handlers.forEach(function(h){h.el.removeEventListener('mouseenter',h.enter);h.el.removeEventListener('mouseleave',h.leave);h.el.removeEventListener('click',h.click);h.el.classList.remove('pp-hover','pp-editing','pp-saved')});handlers=[];if(toolbar)hideBar();if(styleEl&&styleEl.parentNode)styleEl.parentNode.removeChild(styleEl);styleEl=null;active=false}});
  window.addEventListener('keydown',function(e){if(!active||editing)return;if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();if(undoStack.length){var en=undoStack.pop();redoStack.push(en);if(en.image)en.el.setAttribute('src',en.oldVal);else if(en.rich)en.el.innerHTML=en.oldVal;else en.el.textContent=en.oldVal;if(window.parent!==window)window.parent.postMessage({type:'pagepilot:change',key:en.key,value:en.oldVal,content_type:en.image?'image':en.rich?'richtext':'text',original:en.newVal},'*')}}if((e.ctrlKey||e.metaKey)&&(e.key==='Z'||e.key==='y')){e.preventDefault();if(redoStack.length){var en=redoStack.pop();undoStack.push(en);if(en.image)en.el.setAttribute('src',en.newVal);else if(en.rich)en.el.innerHTML=en.newVal;else en.el.textContent=en.newVal;if(window.parent!==window)window.parent.postMessage({type:'pagepilot:change',key:en.key,value:en.newVal,content_type:en.image?'image':en.rich?'richtext':'text',original:en.oldVal},'*')}}});

  if(window.parent!==window)window.parent.postMessage({type:'pagepilot:ready'},'*');
})();
`.trim();

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

    // Always fetch latest published content
    const { rows: contentRows } = await pool.query<ContentRow>(
      `SELECT cms_key, content_type, value FROM content_items
       WHERE website_id = $1 AND is_published = true LIMIT 500`,
      [websiteId],
    );

    let html: string;

    if (website.custom_domain) {
      const mirrorHtml = await getCachedMirror(websiteId, website.custom_domain);
      html = injectContentIntoHtml(mirrorHtml, contentRows);
    } else {
      html = buildFallbackHtml(website, contentRows);
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

function injectContentIntoHtml(html: string, content: ContentRow[]): string {
  if (content.length === 0) return html;
  const $ = cheerio.load(html);
  for (const row of content) {
    if (!row.value) continue;
    const el = $(`[data-cms="${row.cms_key}"]`);
    if (el.length === 0) continue;
    if (row.content_type === 'image') {
      el.attr('src', row.value);
    } else if (row.content_type === 'richtext') {
      el.html(row.value);
    } else {
      el.text(row.value);
    }
  }
  return $.html();
}

async function getCachedMirror(websiteId: string, siteUrl: string): Promise<string> {
  const cacheKey = MIRROR_CACHE_PREFIX + websiteId;

  // Try Redis cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  } catch { /* miss */ }

  // Fetch and transform
  const html = await buildMirrorHtml(siteUrl);

  // Cache for 5 minutes
  redis.set(cacheKey, html, { EX: MIRROR_CACHE_TTL }).catch(() => {});

  return html;
}

async function buildMirrorHtml(siteUrl: string): Promise<string> {
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

  const injection = `
  <script>
  ${INLINE_PAGEPILOT}
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
  <script>${INLINE_PAGEPILOT}<\/script>
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
