import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from './validate.middleware';

function mockReq(body = {}, query = {}, params = {}): Request {
  return { body, query, params } as unknown as Request;
}
const res = {} as Response;

describe('validate middleware', () => {
  it('passes valid body and calls next()', () => {
    const schema = z.object({ name: z.string() });
    const next = vi.fn();
    const req = mockReq({ name: 'hello' });
    validate({ body: schema })(req, res, next);
    expect(next).toHaveBeenCalledWith(); // no args = success
  });

  it('calls next(ValidationError) for invalid body', () => {
    const schema = z.object({ name: z.string() });
    const next = vi.fn();
    const req = mockReq({ name: 123 });
    validate({ body: schema })(req, res, next);
    const err = next.mock.calls[0]?.[0] as { code: string };
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('coerces and transforms valid values', () => {
    const schema = z.object({ age: z.coerce.number() });
    const next = vi.fn();
    const req = mockReq({ age: '25' });
    validate({ body: schema })(req, res, next);
    expect(req.body.age).toBe(25);
    expect(next).toHaveBeenCalledWith();
  });

  it('validates query params', () => {
    const schema = z.object({ page: z.coerce.number().default(1) });
    const next = vi.fn();
    const req = mockReq({}, { page: '3' });
    validate({ query: schema })(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
