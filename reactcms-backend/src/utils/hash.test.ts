import { describe, it, expect } from 'vitest';
import { sha256, hashPassword, verifyPassword, generateApiKey } from './hash';

describe('sha256', () => {
  it('is deterministic', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });
  it('produces 64-char hex', () => {
    expect(sha256('test')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changes for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('hashPassword / verifyPassword', () => {
  it('round-trips correctly', async () => {
    const hash = await hashPassword('mypassword');
    expect(await verifyPassword('mypassword', hash)).toBe(true);
    expect(await verifyPassword('wrongpassword', hash)).toBe(false);
  });

  it('produces different hashes for same input (salted)', async () => {
    const h1 = await hashPassword('same');
    const h2 = await hashPassword('same');
    expect(h1).not.toBe(h2);
  });
});

describe('generateApiKey', () => {
  it('read key starts with cms_pk_', () => {
    const { key } = generateApiKey('read');
    expect(key).toMatch(/^cms_pk_/);
  });

  it('write key starts with cms_sk_', () => {
    const { key } = generateApiKey('write');
    expect(key).toMatch(/^cms_sk_/);
  });

  it('hash is a sha256 of the key', () => {
    const { key, hash } = generateApiKey('read');
    expect(hash).toBe(sha256(key));
  });

  it('prefix is first 12 chars', () => {
    const { key, prefix } = generateApiKey('read');
    expect(prefix).toBe(key.slice(0, 12));
  });

  it('generates unique keys', () => {
    const k1 = generateApiKey('read').key;
    const k2 = generateApiKey('read').key;
    expect(k1).not.toBe(k2);
  });
});
