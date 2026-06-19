import { vi } from 'vitest';

// Mock the entire db/pool module for unit tests
vi.mock('../lib/db/pool', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => {
    const mockClient = { query: vi.fn() };
    return fn(mockClient);
  }),
  setTenantContext: vi.fn(),
  testConnection: vi.fn(),
}));

// Mock Redis for unit tests
vi.mock('../lib/redis', () => ({
  redis: { connect: vi.fn(), quit: vi.fn(), get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn() },
  connectRedis: vi.fn(),
  storeRefreshToken: vi.fn(),
  validateRefreshToken: vi.fn().mockResolvedValue(true),
  revokeRefreshToken: vi.fn(),
  revokeAllUserTokens: vi.fn(),
}));

// Silence logger in tests
vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Provide minimum env for config validation
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-minimum-32-chars-ok';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-minimum-32-chars!';
process.env['API_BASE_URL'] = 'http://localhost:3001';
process.env['CORS_ORIGINS'] = 'http://localhost:5173';
