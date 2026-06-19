import type { ResolvedElement, ContentApplyMode, ContentItem, ContentType } from './types';
import { ATTR_KEY, ATTR_TYPE, ATTR_ATTR, ATTR_FALLBACK } from './constants';

// ── Element scanning ──────────────────────────────────────────────────────────

/**
 * Scan a root element (default: document.body) for all [data-cms] elements.
 * Skips elements with no key value, and deduplicates keys for batch fetching.
 */
export function scanElements(root: Element | Document = document): ResolvedElement[] {
  const nodes = root.querySelectorAll(`[${ATTR_KEY}]`);
  const resolved: ResolvedElement[] = [];

  nodes.forEach((el) => {
    const key = (el.getAttribute(ATTR_KEY) ?? '').trim();
    if (!key) return;

    const modeAttr = (el.getAttribute(ATTR_TYPE) ?? '').trim() as ContentApplyMode | '';
    const attrName = (el.getAttribute(ATTR_ATTR) ?? '').trim();
    const fallback = el.getAttribute(ATTR_FALLBACK) ?? el.textContent ?? '';

    const mode: ContentApplyMode = modeAttr || inferMode(el, attrName);

    resolved.push({ el, key, mode, attrName: attrName || undefined, fallback });
  });

  return resolved;
}

/** Infer the apply mode from the element tag and optional attr name */
function inferMode(el: Element, attrName: string): ContentApplyMode {
  if (attrName) return 'attr';

  const tag = el.tagName.toLowerCase();

  if (tag === 'img' || tag === 'video' || tag === 'audio' || tag === 'iframe') return 'src';
  if (tag === 'a') return 'href';
  if (tag === 'input' || tag === 'textarea') return 'value';
  if (tag === 'meta') return 'attr'; // handled specially below

  return 'auto'; // resolved at apply time based on content_type
}

// ── Content application ───────────────────────────────────────────────────────

/**
 * Apply a fetched ContentItem to a DOM element.
 * Respects the resolved mode and falls back to element's original text if value is null.
 */
export function applyContent(resolved: ResolvedElement, item: ContentItem): void {
  const { el, mode, attrName, fallback } = resolved;
  const value = item.value ?? fallback;

  try {
    const effectiveMode = mode === 'auto' ? autoMode(item.content_type) : mode;

    switch (effectiveMode) {
      case 'text':
        el.textContent = value;
        break;

      case 'html':
        el.innerHTML = value;
        break;

      case 'src':
        el.setAttribute('src', value);
        if (el.tagName.toLowerCase() === 'img' && item.metadata?.['alt']) {
          el.setAttribute('alt', item.metadata['alt'] as string);
        }
        break;

      case 'href':
        el.setAttribute('href', value);
        break;

      case 'value':
        (el as HTMLInputElement).value = value;
        break;

      case 'attr': {
        const name = attrName || 'content'; // <meta> fallback
        el.setAttribute(name, value);
        break;
      }

      default:
        el.textContent = value;
    }

    // Mark element as resolved for CSS targeting
    el.setAttribute('data-cms-loaded', '');
    el.removeAttribute('data-cms-loading');
  } catch (err) {
    // DOM mutation error — silently ignore to never break the page
    console.warn(`[ReactCMS] Failed to apply content to element`, el, err);
  }
}

/** Map content_type to a DOM apply mode */
function autoMode(contentType: ContentType): ContentApplyMode {
  switch (contentType) {
    case 'richtext': return 'html';
    case 'image':    return 'src';
    case 'json':     return 'text'; // JSON displayed as-is unless el handles it
    default:         return 'text';
  }
}

/** Mark elements as loading (lets CSS show skeletons) */
export function markLoading(resolved: ResolvedElement[]): void {
  for (const { el } of resolved) {
    el.setAttribute('data-cms-loading', '');
  }
}

/** Restore fallback content if fetch failed */
export function applyFallback(resolved: ResolvedElement): void {
  const { el, fallback } = resolved;
  if (fallback) el.textContent = fallback;
  el.setAttribute('data-cms-error', '');
  el.removeAttribute('data-cms-loading');
}

// ── MutationObserver ──────────────────────────────────────────────────────────

/**
 * Watch for new [data-cms] elements added to the DOM after initial load.
 * Useful for SPAs that mount content asynchronously, or client-side template rendering.
 * Returns a cleanup function.
 */
export function observeNewElements(
  root: Element | Document,
  onNewElements: (elements: ResolvedElement[]) => void,
): () => void {
  const observer = new MutationObserver((mutations) => {
    const newResolved: ResolvedElement[] = [];

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;

        // Check the node itself
        if (el.hasAttribute(ATTR_KEY)) {
          const key = (el.getAttribute(ATTR_KEY) ?? '').trim();
          if (key) {
            const attrName = (el.getAttribute(ATTR_ATTR) ?? '').trim();
            newResolved.push({
              el,
              key,
              mode: (el.getAttribute(ATTR_TYPE) as ContentApplyMode | null) || inferMode(el, attrName),
              attrName: attrName || undefined,
              fallback: el.getAttribute(ATTR_FALLBACK) ?? el.textContent ?? '',
            });
          }
        }

        // Check descendants
        const descendants = scanElements(el);
        newResolved.push(...descendants);
      }
    }

    if (newResolved.length > 0) {
      onNewElements(newResolved);
    }
  });

  observer.observe(root, { childList: true, subtree: true });

  return () => observer.disconnect();
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Collect unique keys from resolved elements */
export function uniqueKeys(resolved: ResolvedElement[]): string[] {
  return [...new Set(resolved.map((r) => r.key))];
}

/** Read config from the <script> tag that loaded the SDK */
export function readScriptConfig(): Partial<{
  apiKey: string;
  websiteId: string;
  apiUrl: string;
  preview: boolean;
  cacheTtl: number;
  autoDiscover: boolean;
}> {
  // Find the script tag by its src pattern or by specific attributes
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[data-key], script[src*="reactcms"]');

  for (const script of scripts) {
    const apiKey = script.getAttribute('data-key');
    if (!apiKey) continue;

    return {
      apiKey,
      websiteId: script.getAttribute('data-website') ?? undefined,
      apiUrl: script.getAttribute('data-api-url') ?? undefined,
      preview: script.getAttribute('data-preview') === 'true',
      autoDiscover: script.getAttribute('data-auto-discover') === 'true',
      cacheTtl: script.getAttribute('data-cache-ttl')
        ? Number(script.getAttribute('data-cache-ttl'))
        : undefined,
    };
  }

  return {};
}
