import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

export interface DiscoveredItem {
  key: string;
  value: string;
  tag: string;
  content_type: 'text' | 'richtext';
  context: string;
}

const TEXT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'a', 'button', 'label',
  'li', 'td', 'th', 'blockquote', 'figcaption',
  'caption', 'legend', 'dt', 'dd', 'summary',
]);

const SKIP_ANCESTORS = new Set([
  'script', 'style', 'noscript', 'svg', 'head', 'template',
]);

const INLINE_TAGS = new Set([
  'strong', 'em', 'b', 'i', 'u', 'a', 'span', 'br',
  'small', 'mark', 'sub', 'sup', 'code',
]);

const MIN_TEXT = 2;
const MAX_KEY_LEN = 60;

function slugify(text: string, maxLen: number): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
}

function getTagName(node: AnyNode): string | undefined {
  return (node as any).tagName?.toLowerCase();
}

function isInsideSkipped($: cheerio.CheerioAPI, el: AnyNode): boolean {
  const parents = $(el).parents().toArray();
  return parents.some((p) => {
    const tag = getTagName(p);
    return tag ? SKIP_ANCESTORS.has(tag) : false;
  });
}

function hasChildTextTag($: cheerio.CheerioAPI, el: AnyNode): boolean {
  const tagSelector = Array.from(TEXT_TAGS).join(',');
  const children = $(el).find(tagSelector);
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child === el) continue;
    const text = $(child).text().trim();
    if (text.length >= MIN_TEXT) return true;
  }
  return false;
}

function hasInlineMarkup($: cheerio.CheerioAPI, el: AnyNode): boolean {
  const children = $(el).children().toArray();
  for (const child of children) {
    const childTag = getTagName(child);
    if (childTag && INLINE_TAGS.has(childTag)) return true;
  }
  return false;
}

function buildContext($: cheerio.CheerioAPI, el: AnyNode): string {
  const parent = $(el).parent();
  const parentTag = parent[0] ? getTagName(parent[0]) ?? '' : '';
  const parentClass = parent.attr('class') ?? '';
  const parentId = parent.attr('id') ?? '';
  const parts = [parentTag];
  if (parentId) parts.push(`#${parentId}`);
  if (parentClass) parts.push(`.${parentClass.split(/\s+/)[0]}`);
  return parts.join('');
}

export async function fetchAndScanHtml(url: string): Promise<DiscoveredItem[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ReactCMS-Scanner/1.0' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }

  const html = await res.text();
  return scanHtml(html);
}

export function scanHtml(html: string): DiscoveredItem[] {
  const $ = cheerio.load(html);
  const discovered: DiscoveredItem[] = [];
  const usedKeys = new Set<string>();

  const allElements = $('body *').toArray();

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i]!;
    const tag = getTagName(el);

    if (!tag || !TEXT_TAGS.has(tag)) continue;
    if ($(el).attr('data-cms')) continue;
    if (isInsideSkipped($, el)) continue;

    const fullText = $(el).text().trim();
    if (fullText.length < MIN_TEXT) continue;
    if (hasChildTextTag($, el)) continue;

    const hasMk = hasInlineMarkup($, el);
    const value = hasMk ? $(el).html()?.trim() ?? fullText : fullText;
    if (value.length < MIN_TEXT) continue;

    const slug = slugify(fullText, MAX_KEY_LEN - tag.length - 5);
    let key = slug.length >= 3 ? `${tag}-${slug}` : `${tag}-${i}`;

    if (usedKeys.has(key)) {
      let suffix = 2;
      while (usedKeys.has(`${key}-${suffix}`)) suffix++;
      key = `${key}-${suffix}`;
    }
    usedKeys.add(key);

    discovered.push({
      key,
      value,
      tag,
      content_type: hasMk ? 'richtext' : 'text',
      context: buildContext($, el),
    });
  }

  return discovered;
}
