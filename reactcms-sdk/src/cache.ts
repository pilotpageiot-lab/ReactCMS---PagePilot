import type { CacheEntry, ContentItem } from './types';
import { CACHE_PREFIX } from './constants';

/**
 * Two-layer cache:
 *   1. In-memory Map — zero-latency, lives for the page session
 *   2. localStorage — survives page reloads, honoured only if not expired
 *
 * localStorage is used as a read-through warming layer. Any error reading/
 * writing localStorage is silently swallowed — storage quota, private browsing,
 * or cross-origin restrictions must never break the SDK.
 */
export class ContentCache {
  private memory = new Map<string, CacheEntry>();
  private ttl: number;
  private websiteId: string;

  constructor(websiteId: string, ttlMs: number) {
    this.websiteId = websiteId;
    this.ttl = ttlMs;
  }

  private storageKey(key: string): string {
    return `${CACHE_PREFIX}${this.websiteId}:${key}`;
  }

  get(key: string): ContentItem | null {
    const now = Date.now();

    // 1. Memory hit
    const mem = this.memory.get(key);
    if (mem) {
      if (mem.expiresAt > now) return mem.item;
      this.memory.delete(key);
    }

    // 2. localStorage hit
    try {
      const raw = localStorage.getItem(this.storageKey(key));
      if (raw) {
        const entry: CacheEntry = JSON.parse(raw);
        if (entry.expiresAt > now) {
          // Warm memory from storage
          this.memory.set(key, entry);
          return entry.item;
        }
        // Expired — clean up
        localStorage.removeItem(this.storageKey(key));
      }
    } catch {
      // localStorage unavailable or JSON parse error
    }

    return null;
  }

  set(item: ContentItem): void {
    const entry: CacheEntry = {
      item,
      expiresAt: Date.now() + this.ttl,
    };

    this.memory.set(item.key, entry);

    try {
      localStorage.setItem(this.storageKey(item.key), JSON.stringify(entry));
    } catch {
      // Quota exceeded or unavailable — memory cache still works
    }
  }

  setMany(items: ContentItem[]): void {
    for (const item of items) this.set(item);
  }

  /** Collect keys that are not in cache (need fetching) */
  getMisses(keys: string[]): string[] {
    return keys.filter((k) => this.get(k) === null);
  }

  invalidate(key: string): void {
    this.memory.delete(key);
    try {
      localStorage.removeItem(this.storageKey(key));
    } catch {}
  }

  invalidateAll(): void {
    this.memory.clear();
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(`${CACHE_PREFIX}${this.websiteId}:`)) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
  }
}
