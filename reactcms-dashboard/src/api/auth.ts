import { client, setToken, clearToken } from '@/lib/api-client';
import type { User } from '@/types';

interface AuthResponse {
  user: User;
  access_token: string;
}

export const authApi = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const data = await client.post<AuthResponse>('/v1/auth/login', { email, password });
    setToken(data.access_token);
    return data;
  },

  register: async (name: string, email: string, password: string): Promise<AuthResponse> => {
    const data = await client.post<AuthResponse>('/v1/auth/register', { name, email, password });
    setToken(data.access_token);
    return data;
  },

  logout: async (): Promise<void> => {
    await client.post('/v1/auth/logout').catch(() => {});
    clearToken();
  },

  me: (): Promise<User> => client.get<User>('/v1/auth/me'),
};
