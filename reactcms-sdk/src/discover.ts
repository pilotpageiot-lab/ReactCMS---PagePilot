import { ATTR_KEY } from './constants';

export interface DiscoveredElement {
  el: Element;
  key: string;
  value: string;
  tag: string;
  content_type: 'text' | 'richtext';
}

const TEXT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'a', 'button', 'label',
  'li', 'td', 'th', 'blockquote', 'figcaption',
  'caption', 'legend', 'dt', 'dd', 'summary',
  'small', 'strong', 'em', 'b', 'i', 'u',
]);

const SKIP_ANCESTORS = new Set([
  'script', 'style', 'noscript', 'svg', 'head', 'template',
]);

const MIN_TEXT_LENGTH = 2;
const MAX_KEY_LENGTH = 60;

function isInsideSkippedAncestor(el: Element): boolean {
  let parent = el.parentElement;
  while (parent) {
    if (SKIP_ANCESTORS.has(parent.tagName.toLowerCase())) return true;
    parent = parent.parentElement;
  }
  return false;
}

function hasDirectText(el: Element): boolean {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length >= MIN_TEXT_LENGTH) {
      return true;
    }
  }
  return false;
}

function getDirectText(el: Element): string {
  const parts: string[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').trim();
      if (text) parts.push(text);
    }
  }
  return parts.join(' ');
}

function slugify(text: string, maxLen: number): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
}

function generateKey(tag: string, text: string, index: number): string {
  const slug = slugify(text, MAX_KEY_LENGTH - tag.length - 5);
  if (slug.length >= 3) return `${tag}-${slug}`;
  return `${tag}-${index}`;
}

function hasInlineMarkup(el: Element): boolean {
  const children = el.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    const childTag = child.tagName.toLowerCase();
    if (['strong', 'em', 'b', 'i', 'u', 'a', 'span', 'br', 'small', 'mark', 'sub', 'sup', 'code'].includes(childTag)) {
      return true;
    }
  }
  return false;
}

/**
 * Scan the DOM for all text-bearing elements and generate CMS keys.
 * Skips elements already tagged with data-cms.
 */
export function discoverElements(root: Element | Document = document): DiscoveredElement[] {
  const discovered: DiscoveredElement[] = [];
  const usedKeys = new Set<string>();

  const allElements = root.querySelectorAll('*');

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i]!;
    const tag = el.tagName.toLowerCase();

    if (el.hasAttribute(ATTR_KEY)) continue;
    if (!TEXT_TAGS.has(tag)) continue;
    if (isInsideSkippedAncestor(el)) continue;

    const fullText = (el.textContent ?? '').trim();
    if (fullText.length < MIN_TEXT_LENGTH) continue;

    // Prefer leaf-level elements: skip if a child TEXT_TAG also has meaningful text
    // (so we tag the <h5> inside a <li>, not the <li> itself)
    if (hasChildTextTag(el)) continue;

    const hasMarkup = hasInlineMarkup(el);
    const value = hasMarkup ? el.innerHTML.trim() : (getDirectText(el) || fullText);
    if (value.length < MIN_TEXT_LENGTH) continue;

    let key = generateKey(tag, fullText, i);

    // Deduplicate keys
    if (usedKeys.has(key)) {
      let suffix = 2;
      while (usedKeys.has(`${key}-${suffix}`)) suffix++;
      key = `${key}-${suffix}`;
    }
    usedKeys.add(key);

    discovered.push({
      el,
      key,
      value,
      tag,
      content_type: hasMarkup ? 'richtext' : 'text',
    });
  }

  return discovered;
}

function hasChildTextTag(el: Element): boolean {
  const children = el.querySelectorAll(Array.from(TEXT_TAGS).join(','));
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child === el) continue;
    if (child.hasAttribute(ATTR_KEY)) continue;
    const text = (child.textContent ?? '').trim();
    if (text.length >= MIN_TEXT_LENGTH) return true;
  }
  return false;
}
