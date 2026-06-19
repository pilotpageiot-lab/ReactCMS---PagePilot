import { describe, it, expect } from 'vitest';
import { singleContentQuerySchema, batchContentQuerySchema } from './public.schema';

// ── singleContentQuerySchema ──────────────────────────────────────────────────

describe('singleContentQuerySchema', () => {
  const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('accepts valid website_id and key', () => {
    const result = singleContentQuerySchema.parse({
      website_id: VALID_UUID,
      key: 'hero-title',
    });
    expect(result.website_id).toBe(VALID_UUID);
    expect(result.key).toBe('hero-title');
    expect(result.preview).toBe(false);
  });

  it('rejects missing website_id', () => {
    expect(() =>
      singleContentQuerySchema.parse({ key: 'hero' }),
    ).toThrow();
  });

  it('rejects non-UUID website_id', () => {
    expect(() =>
      singleContentQuerySchema.parse({ website_id: 'not-a-uuid', key: 'hero' }),
    ).toThrow();
  });

  it('rejects missing key', () => {
    expect(() =>
      singleContentQuerySchema.parse({ website_id: VALID_UUID }),
    ).toThrow();
  });

  it('rejects empty key', () => {
    expect(() =>
      singleContentQuerySchema.parse({ website_id: VALID_UUID, key: '' }),
    ).toThrow();
  });

  it('rejects key with invalid characters', () => {
    expect(() =>
      singleContentQuerySchema.parse({
        website_id: VALID_UUID,
        key: 'hero title!', // space and !
      }),
    ).toThrow();
  });

  it('accepts keys with dots, hyphens, underscores', () => {
    for (const key of ['hero_title', 'hero-title', 'section.hero.title']) {
      const result = singleContentQuerySchema.parse({ website_id: VALID_UUID, key });
      expect(result.key).toBe(key);
    }
  });

  it('rejects key over 200 chars', () => {
    expect(() =>
      singleContentQuerySchema.parse({
        website_id: VALID_UUID,
        key: 'a'.repeat(201),
      }),
    ).toThrow();
  });

  it('coerces preview string to boolean', () => {
    const result = singleContentQuerySchema.parse({
      website_id: VALID_UUID,
      key: 'hero',
      preview: 'true',
    });
    expect(result.preview).toBe(true);
  });

  it('defaults preview to false', () => {
    const result = singleContentQuerySchema.parse({
      website_id: VALID_UUID,
      key: 'hero',
    });
    expect(result.preview).toBe(false);
  });
});

// ── batchContentQuerySchema ───────────────────────────────────────────────────

describe('batchContentQuerySchema', () => {
  const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('splits comma-separated keys string', () => {
    const result = batchContentQuerySchema.parse({
      website_id: VALID_UUID,
      keys: 'hero-title,hero-subtitle,cta-label',
    });
    expect(result.keys).toEqual(['hero-title', 'hero-subtitle', 'cta-label']);
  });

  it('trims whitespace around keys', () => {
    const result = batchContentQuerySchema.parse({
      website_id: VALID_UUID,
      keys: 'hero , subtitle , cta',
    });
    expect(result.keys).toEqual(['hero', 'subtitle', 'cta']);
  });

  it('rejects more than 50 keys', () => {
    const keys = Array.from({ length: 51 }, (_, i) => `key-${i}`).join(',');
    expect(() =>
      batchContentQuerySchema.parse({ website_id: VALID_UUID, keys }),
    ).toThrow();
  });

  it('rejects empty keys string', () => {
    expect(() =>
      batchContentQuerySchema.parse({ website_id: VALID_UUID, keys: '' }),
    ).toThrow();
  });

  it('rejects missing keys', () => {
    expect(() =>
      batchContentQuerySchema.parse({ website_id: VALID_UUID }),
    ).toThrow();
  });

  it('accepts exactly 50 keys', () => {
    const keys = Array.from({ length: 50 }, (_, i) => `key-${i}`).join(',');
    const result = batchContentQuerySchema.parse({ website_id: VALID_UUID, keys });
    expect(result.keys).toHaveLength(50);
  });
});
