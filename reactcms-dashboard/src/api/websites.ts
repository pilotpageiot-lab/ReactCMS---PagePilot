import { client } from '@/lib/api-client';
import type { Website, Member, PendingInvite } from '@/types';

export const websitesApi = {
  list: (): Promise<{ data: Website[]; total: number }> =>
    client.get('/v1/websites'),

  get: (id: string): Promise<Website> =>
    client.get(`/v1/websites/${id}`),

  create: (payload: { name: string; slug: string; plan?: string }): Promise<Website> =>
    client.post('/v1/websites', payload),

  update: (
    id: string,
    payload: Partial<{ name: string; custom_domain: string | null; is_active: boolean }>,
  ): Promise<Website> =>
    client.patch(`/v1/websites/${id}`, payload),

  delete: (id: string): Promise<void> =>
    client.delete(`/v1/websites/${id}?confirm=true`),

  // Members
  listMembers: (id: string): Promise<{ data: Member[] }> =>
    client.get(`/v1/websites/${id}/members`),

  inviteMember: (
    id: string,
    payload: { email: string; role: string },
  ): Promise<unknown> =>
    client.post(`/v1/websites/${id}/members`, payload),

  removeMember: (websiteId: string, userId: string): Promise<void> =>
    client.delete(`/v1/websites/${websiteId}/members/${userId}`),

  // Invites
  listPendingInvites: (): Promise<{ data: PendingInvite[] }> =>
    client.get('/v1/websites/invites/pending'),

  acceptInvite: (websiteId: string): Promise<unknown> =>
    client.post(`/v1/websites/invites/${websiteId}/accept`, {}),

  declineInvite: (websiteId: string): Promise<void> =>
    client.post(`/v1/websites/invites/${websiteId}/decline`, {}),
};
