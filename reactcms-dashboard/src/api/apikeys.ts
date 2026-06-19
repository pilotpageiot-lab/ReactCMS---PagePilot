import { client } from '@/lib/api-client';
import type { ApiKey } from '@/types';

export const apiKeysApi = {
  list: (websiteId: string): Promise<{ data: ApiKey[] }> =>
    client.get(`/v1/websites/${websiteId}/keys`),

  create: (
    websiteId: string,
    payload: { label: string; scope: 'read' | 'write'; expires_at?: string | null },
  ): Promise<ApiKey & { key: string }> =>
    client.post(`/v1/websites/${websiteId}/keys`, payload),

  revoke: (websiteId: string, keyId: string): Promise<void> =>
    client.delete(`/v1/websites/${websiteId}/keys/${keyId}`),
};
