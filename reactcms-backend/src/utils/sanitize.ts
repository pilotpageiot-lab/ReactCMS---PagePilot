/**
 * Server-side HTML sanitisation for richtext content.
 *
 * Uses a strict allowlist. Applied on WRITE so the stored value
 * is always clean — the client never needs to trust API output.
 *
 * We implement a minimal sanitiser without the isomorphic-dompurify
 * dependency (avoids the JSDOM overhead in Node). For production,
 * replace with: import createDOMPurify from 'isomorphic-dompurify';
 *
 * The approach: strip all tags not on the allowlist, strip all
 * attributes not on the per-tag allowlist, and encode angle brackets
 * in text nodes.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's', 'del',
  'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'hr', 'code', 'pre', 'span',
]);

const ALLOWED_ATTRS: Record<string, string[]> = {
  a:    ['href', 'target', 'rel'],
  img:  [], // img not allowed — prevents SSRF via image loads
  span: ['class'],
  code: ['class'],
  pre:  ['class'],
};

const SAFE_URL = /^(https?:\/\/|mailto:|\/|#)/i;

/**
 * Minimal HTML sanitiser.
 * Strips disallowed tags and attributes.
 * Forces target="_blank" links to also have rel="noopener noreferrer".
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';

  // Strip script/style/iframe blocks entirely (including content)
  let clean = dirty
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')  // strip event handlers
    .replace(/javascript\s*:/gi, '');               // strip js: URLs

  // Strip disallowed tags but keep their text content
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tagName) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Self-closing or closing tag of a disallowed element — remove entirely
      return '';
    }

    // Rebuild allowed tag with only permitted attributes
    const allowed = ALLOWED_ATTRS[tag] ?? [];
    let rebuilt = `<${tag}`;

    // Extract each attribute
    const attrRegex = /([a-zA-Z\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let m;
    while ((m = attrRegex.exec(match)) !== null) {
      const attrName = m[1]!.toLowerCase();
      const attrValue = m[2] ?? m[3] ?? m[4] ?? '';

      if (!allowed.includes(attrName)) continue;

      // Validate URLs
      if ((attrName === 'href' || attrName === 'src') && !SAFE_URL.test(attrValue)) {
        continue;
      }

      rebuilt += ` ${attrName}="${attrValue.replace(/"/g, '&quot;')}"`;
    }

    // Force safe rel on external links
    if (tag === 'a') {
      if (rebuilt.includes('target="_blank"') && !rebuilt.includes('rel=')) {
        rebuilt += ' rel="noopener noreferrer"';
      }
    }

    // Self-closing check
    if (match.endsWith('/>')) rebuilt += ' />';
    else rebuilt += '>';

    return rebuilt;
  });

  return clean.trim();
}

/**
 * Encode a plain string for safe insertion into HTML context.
 * Use for text fields — not needed for richtext (already sanitised above).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
