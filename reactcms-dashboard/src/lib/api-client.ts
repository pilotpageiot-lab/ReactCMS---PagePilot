const BASE_URL = import.meta.env['VITE_API_URL'] ?? '';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  return localStorage.getItem('rcms_access_token');
}

export function setToken(token: string): void {
  localStorage.setItem('rcms_access_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('rcms_access_token');
}

let refreshPromise: Promise<boolean> | null = null;

function isTokenExpiringSoon(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

async function ensureValidToken(): Promise<void> {
  if (!getToken() || !isTokenExpiringSoon()) return;
  if (!refreshPromise) {
    refreshPromise = attemptRefresh().finally(() => { refreshPromise = null; });
  }
  await refreshPromise;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (path !== '/v1/auth/refresh') {
    await ensureValidToken();
  }

  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include', // send refresh cookie
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({ error: 'PARSE_ERROR', message: 'Invalid response' }));

  if (!res.ok) {
    // Attempt token refresh on 401
    if (res.status === 401 && path !== '/v1/auth/refresh') {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        return request<T>(path, init);
      }
    }
    throw new ApiError(
      data.error ?? 'UNKNOWN',
      data.message ?? 'Request failed',
      res.status,
      data.details,
    );
  }

  return data as T;
}

async function attemptRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      clearToken();
      return false;
    }
    const data = await res.json() as { access_token: string };
    setToken(data.access_token);
    return true;
  } catch {
    clearToken();
    return false;
  }
}

export const client = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};
