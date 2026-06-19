import { Request } from 'express';

export type UserRole = 'superadmin' | 'user';
export type MemberRole = 'admin' | 'editor' | 'viewer';
export type ContentType = 'text' | 'richtext' | 'image' | 'json';
export type Plan = 'free' | 'pro' | 'enterprise';
export type ApiKeyScope = 'read' | 'write';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface ApiKeyContext {
  id: string;
  websiteId: string;
  scope: ApiKeyScope;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      apiKey?: ApiKeyContext;
      websiteId?: string;      // set by requireWebsiteMember middleware
      memberRole?: MemberRole; // set by requireWebsiteMember middleware
    }
  }
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}
