import { client } from '@/lib/api-client';
import type { ContentItem, ContentVersion, PaginatedResponse, ScanResult, ImportBatchResult } from '@/types';

interface ListContentParams {
  type?: string;
  published?: boolean;
  search?: string;
  page?: number;
  per_page?: number;
}

export const contentApi = {
  list: (websiteId: string, params: ListContentParams = {}): Promise<PaginatedResponse<ContentItem>> => {
    const qs = new URLSearchParams();
    if (params.type) qs.set('type', params.type);
    if (params.published !== undefined) qs.set('published', String(params.published));
    if (params.search) qs.set('search', params.search);
    if (params.page) qs.set('page', String(params.page));
    if (params.per_page) qs.set('per_page', String(params.per_page));
    const query = qs.toString();
    return client.get(`/v1/websites/${websiteId}/content${query ? `?${query}` : ''}`);
  },

  get: (websiteId: string, key: string, draft = false): Promise<ContentItem> =>
    client.get(`/v1/websites/${websiteId}/content/${key}${draft ? '?draft=true' : ''}`),

  upsert: (
    websiteId: string,
    key: string,
    payload: { content_type: string; value: string | null; metadata?: Record<string, unknown> },
  ): Promise<ContentItem> =>
    client.patch(`/v1/websites/${websiteId}/content/${key}`, payload),

  delete: (websiteId: string, key: string): Promise<void> =>
    client.delete(`/v1/websites/${websiteId}/content/${key}`),

  deleteAll: (websiteId: string): Promise<{ deleted: number }> =>
    client.delete(`/v1/websites/${websiteId}/content/all`),

  publish: (websiteId: string, key: string): Promise<ContentItem> =>
    client.post(`/v1/websites/${websiteId}/content/${key}/publish`, {}),

  listVersions: (websiteId: string, key: string): Promise<{ data: ContentVersion[] }> =>
    client.get(`/v1/websites/${websiteId}/content/${key}/versions`),

  restore: (websiteId: string, key: string, version: number): Promise<ContentItem> =>
    client.post(`/v1/websites/${websiteId}/content/${key}/restore/${version}`, {}),

  scan: (websiteId: string, url: string): Promise<ScanResult> =>
    client.post(`/v1/websites/${websiteId}/content/scan`, { url }),

  importBatch: (
    websiteId: string,
    items: { key: string; value: string; content_type: string }[],
  ): Promise<ImportBatchResult> =>
    client.post(`/v1/websites/${websiteId}/content/import-batch`, { items }),
};
