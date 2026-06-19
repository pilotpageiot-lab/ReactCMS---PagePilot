import type { ContentItem, BatchResponse, ReactCMSConfig } from './types';
import {
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_BASE_MS,
  DEFAULT_BATCH_SIZE,
  LOG_PREFIX,
} from './constants';

/**
 * Exponential back-off for 429 / 5xx responses.
 * Never retries on 4xx (except 429) — those are permanent errors.
 */
function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelay(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const secs = parseInt(retryAfterHeader, 10);
    if (!isNaN(secs)) return secs * 1000;
  }
  return DEFAULT_RETRY_BASE_MS * Math.pow(2, attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class ContentFetcher {
  private config: Required<
    Pick<ReactCMSConfig, 'apiKey' | 'websiteId' | 'apiUrl' | 'preview'>
  >;
  private etags = new Map<string, string>();

  constructor(
    config: Pick<ReactCMSConfig, 'apiKey' | 'websiteId' | 'apiUrl' | 'preview'>,
  ) {
    this.config = {
      apiKey: config.apiKey,
      websiteId: config.websiteId,
      apiUrl: config.apiUrl ?? 'https://api.reactcms.io',
      preview: config.preview ?? false,
    };
  }

  private get baseHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-CMS-Key': this.config.apiKey,
    };
  }

  private buildUrl(path: string, extra: Record<string, string> = {}): string {
    const url = new URL(path, this.config.apiUrl);
    url.searchParams.set('website_id', this.config.websiteId);
    if (this.config.preview) url.searchParams.set('preview', 'true');
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    return url.toString();
  }

  /** Fetch a single content item (with ETag support for 304) */
  async fetchOne(key: string): Promise<ContentItem | null> {
    const url = this.buildUrl(`/public/content`, { key });
    const headers: Record<string, string> = { ...this.baseHeaders };

    const cachedEtag = this.etags.get(key);
    if (cachedEtag) headers['If-None-Match'] = cachedEtag;

    for (let attempt = 0; attempt <= DEFAULT_RETRY_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { headers, credentials: 'omit' });
      } catch (err) {
        // Network error — retry
        if (attempt < DEFAULT_RETRY_ATTEMPTS) {
          await sleep(retryDelay(attempt, null));
          continue;
        }
        throw err;
      }

      if (res.status === 304) return null; // not modified — use cached value

      if (res.ok) {
        const etag = res.headers.get('ETag');
        if (etag) this.etags.set(key, etag);
        const data = await res.json() as ContentItem;
        return data;
      }

      if (shouldRetry(res.status) && attempt < DEFAULT_RETRY_ATTEMPTS) {
        await sleep(retryDelay(attempt, res.headers.get('Retry-After')));
        continue;
      }

      if (res.status === 401) throw new Error('Invalid API key');
      if (res.status === 404) return null;
      throw new Error(`Fetch failed: HTTP ${res.status}`);
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Submit discovered elements to the backend for auto-registration.
   * Requires a write-scoped API key (cms_sk_...).
   */
  async submitDiscover(
    items: { key: string; value: string; content_type: string }[],
  ): Promise<{ created: string[]; existing: string[] }> {
    if (items.length === 0) return { created: [], existing: [] };

    const url = this.buildUrl('/public/content/discover');
    const res = await fetch(url, {
      method: 'POST',
      headers: this.baseHeaders,
      credentials: 'omit',
      body: JSON.stringify({
        website_id: this.config.websiteId,
        items,
      }),
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error('Invalid API key');
      if (res.status === 403) throw new Error('Auto-discover requires a write-scoped API key (cms_sk_...)');
      throw new Error(`Discover failed: HTTP ${res.status}`);
    }

    return res.json();
  }

  /**
   * Batch-fetch up to 50 keys in a single POST.
   * Chunks larger arrays automatically.
   */
  async fetchBatch(keys: string[]): Promise<Map<string, ContentItem>> {
    if (keys.length === 0) return new Map();

    const result = new Map<string, ContentItem>();
    const chunks: string[][] = [];

    for (let i = 0; i < keys.length; i += DEFAULT_BATCH_SIZE) {
      chunks.push(keys.slice(i, i + DEFAULT_BATCH_SIZE));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const url = this.buildUrl('/public/content/batch');

        for (let attempt = 0; attempt <= DEFAULT_RETRY_ATTEMPTS; attempt++) {
          let res: Response;
          try {
            res = await fetch(url, {
              method: 'POST',
              headers: this.baseHeaders,
              credentials: 'omit',
              body: JSON.stringify({
                website_id: this.config.websiteId,
                keys: chunk,
                preview: this.config.preview,
              }),
            });
          } catch (err) {
            if (attempt < DEFAULT_RETRY_ATTEMPTS) {
              await sleep(retryDelay(attempt, null));
              continue;
            }
            throw err;
          }

          if (res.ok) {
            const data = await res.json() as BatchResponse;
            for (const [k, item] of Object.entries(data.data)) {
              result.set(k, item);
            }
            break;
          }

          if (shouldRetry(res.status) && attempt < DEFAULT_RETRY_ATTEMPTS) {
            await sleep(retryDelay(attempt, res.headers.get('Retry-After')));
            continue;
          }

          if (res.status === 401) throw new Error('Invalid API key');
          throw new Error(`Batch fetch failed: HTTP ${res.status}`);
        }
      }),
    );

    return result;
  }
}
