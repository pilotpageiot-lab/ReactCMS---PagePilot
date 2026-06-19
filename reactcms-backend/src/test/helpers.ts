import { signAccessToken } from '../lib/jwt';

export function makeAccessToken(overrides: Partial<{
  sub: string; email: string; role: string
}> = {}) {
  return signAccessToken({
    sub: overrides.sub ?? 'user-uuid-test',
    email: overrides.email ?? 'test@example.com',
    role: overrides.role ?? 'user',
  });
}

export function makeSuperAdminToken() {
  return makeAccessToken({ sub: 'admin-uuid', role: 'superadmin' });
}

export function bearerHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Build a minimal mock pg QueryResult */
export function mockRows<T>(rows: T[]): { rows: T[]; rowCount: number } {
  return { rows, rowCount: rows.length };
}
