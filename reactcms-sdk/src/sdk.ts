import type { ReactCMSConfig, ContentItem, ResolvedElement } from './types';
import { ContentCache } from './cache';
import { ContentFetcher } from './fetcher';
import {
  scanElements,
  markLoading,
  applyContent,
  applyFallback,
  observeNewElements,
  uniqueKeys,
  readScriptConfig,
} from './dom';
import { discoverElements } from './discover';
import {
  DEFAULT_CACHE_TTL,
  LOG_PREFIX,
  SDK_VERSION,
  ATTR_KEY,
} from './constants';

export class ReactCMS {
  private config: Required<ReactCMSConfig>;
  private cache: ContentCache;
  private fetcher: ContentFetcher;
  private stopObserver: (() => void) | null = null;

  constructor(config: ReactCMSConfig) {
    this.config = {
      apiUrl: 'https://api.reactcms.io',
      preview: false,
      cacheTtl: DEFAULT_CACHE_TTL,
      onLoad: () => {},
      onError: () => {},
      ...config,
    };

    this.cache = new ContentCache(this.config.websiteId, this.config.cacheTtl);
    this.fetcher = new ContentFetcher({
      apiKey: this.config.apiKey,
      websiteId: this.config.websiteId,
      apiUrl: this.config.apiUrl,
      preview: this.config.preview,
    });
  }

  async load(root = document): Promise<void> {
    const resolved = scanElements(root);
    if (resolved.length === 0) return;
    await this.resolveAndApply(resolved);
  }

  async loadKey(key: string, el?: Element): Promise<ContentItem | null> {
    const cached = this.cache.get(key);
    if (cached) {
      if (el) {
        const r = this.makeResolved(el, key);
        applyContent(r, cached);
        this.config.onLoad(key, cached.value, el);
      }
      return cached;
    }

    try {
      const item = await this.fetcher.fetchOne(key);
      if (!item) return null;
      this.cache.set(item);
      if (el) {
        const r = this.makeResolved(el, key);
        applyContent(r, item);
        this.config.onLoad(key, item.value, el);
      }
      return item;
    } catch (err) {
      this.config.onError(key, err instanceof Error ? err : new Error(String(err)), el ?? null);
      return null;
    }
  }

  observe(root: Element | Document = document): void {
    if (this.stopObserver) return;
    this.stopObserver = observeNewElements(root, (els) => {
      void this.resolveAndApply(els);
    });
  }

  stopObserving(): void {
    this.stopObserver?.();
    this.stopObserver = null;
  }

  /**
   * Auto-discover all text-bearing elements on the page, register them in the CMS,
   * and inject data-cms attributes so they become managed immediately.
   * Requires a write-scoped API key (cms_sk_...).
   */
  async discover(root: Element | Document = document): Promise<{
    created: string[];
    existing: string[];
    total: number;
  }> {
    const discovered = discoverElements(root);
    if (discovered.length === 0) {
      console.info(`${LOG_PREFIX} Auto-discover found no text elements to register`);
      return { created: [], existing: [], total: 0 };
    }

    console.info(`${LOG_PREFIX} Auto-discover found ${discovered.length} text elements`);

    const items = discovered.map((d) => ({
      key: d.key,
      value: d.value,
      content_type: d.content_type,
    }));

    try {
      const result = await this.fetcher.submitDiscover(items);

      // Inject data-cms attributes on all discovered elements
      for (const d of discovered) {
        d.el.setAttribute(ATTR_KEY, d.key);
      }

      console.info(
        `${LOG_PREFIX} Auto-discover registered ${result.created.length} new keys, ` +
        `${result.existing.length} already existed`,
      );

      return { ...result, total: discovered.length };
    } catch (err) {
      console.error(`${LOG_PREFIX} Auto-discover failed`, err);
      throw err;
    }
  }

  invalidate(key: string): void { this.cache.invalidate(key); }
  invalidateAll(): void { this.cache.invalidateAll(); }

  private makeResolved(el: Element, key: string): ResolvedElement {
    const attrName = el.getAttribute('data-cms-attr') ?? undefined;
    return {
      el,
      key,
      mode: (el.getAttribute('data-cms-type') as ResolvedElement['mode']) || 'auto',
      attrName,
      fallback: el.getAttribute('data-cms-fallback') ?? el.textContent ?? '',
    };
  }

  private async resolveAndApply(resolved: ResolvedElement[]): Promise<void> {
    const keyToElements = new Map<string, ResolvedElement[]>();
    for (const r of resolved) {
      const list = keyToElements.get(r.key) ?? [];
      list.push(r);
      keyToElements.set(r.key, list);
    }

    const allKeys = uniqueKeys(resolved);
    const missKeys: string[] = [];

    for (const key of allKeys) {
      const cached = this.cache.get(key);
      if (cached) {
        for (const r of keyToElements.get(key) ?? []) {
          applyContent(r, cached);
          this.config.onLoad(key, cached.value, r.el);
        }
      } else {
        missKeys.push(key);
        markLoading(keyToElements.get(key) ?? []);
      }
    }

    if (missKeys.length === 0) return;

    try {
      const fetched = await this.fetcher.fetchBatch(missKeys);

      for (const [key, item] of fetched) {
        this.cache.set(item);
        for (const r of keyToElements.get(key) ?? []) {
          applyContent(r, item);
          this.config.onLoad(key, item.value, r.el);
        }
      }

      for (const key of missKeys) {
        if (!fetched.has(key)) {
          for (const r of keyToElements.get(key) ?? []) {
            applyFallback(r);
            this.config.onError(
              key,
              new Error(`Content key "${key}" not found or unpublished`),
              r.el,
            );
          }
        }
      }
    } catch (err) {
      for (const key of missKeys) {
        for (const r of keyToElements.get(key) ?? []) {
          applyFallback(r);
          this.config.onError(
            key,
            err instanceof Error ? err : new Error(String(err)),
            r.el,
          );
        }
      }
    }
  }
}
