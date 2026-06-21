export interface User {
  id: string;
  email: string;
  name: string;
  role: 'superadmin' | 'user';
  created_at: string;
}

export interface Website {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  is_active: boolean;
  content_count: number;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  created_at: string;
  updated_at: string;
}

export type ContentType = 'text' | 'richtext' | 'image' | 'json';

export interface ContentItem {
  id: string;
  website_id: string;
  cms_key: string;
  content_type: ContentType;
  value: string | null;
  metadata: Record<string, unknown>;
  is_published: boolean;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentVersion {
  version: number;
  value: string | null;
  metadata: Record<string, unknown>;
  changed_by: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  label: string;
  key_prefix: string;
  scope: 'read' | 'write';
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface Member {
  user_id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer' | 'owner';
  accepted_at: string | null;
}

export interface PendingInvite {
  invite_id: string;
  role: 'admin' | 'editor' | 'viewer';
  invited_at: string;
  website_id: string;
  website_name: string;
  slug: string;
  invited_by_name: string;
  invited_by_email: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface ScannedItem {
  key: string;
  value: string;
  tag: string;
  content_type: 'text' | 'richtext';
  context: string;
  exists: boolean;
}

export interface ScanResult {
  items: ScannedItem[];
  total: number;
  new_count: number;
}

export interface ImportBatchResult {
  created: string[];
  existing: string[];
}

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}
