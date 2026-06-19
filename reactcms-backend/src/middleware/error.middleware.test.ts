import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { errorMiddleware } from './error.middleware';
import { NotFoundError, UnauthorizedError, ConflictError } from '../utils/errors';

function mockRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json, _json: json } as unknown as Response & { _json: typeof json };
}
const req = {} as Request;
const next = vi.fn() as unknown as NextFunction;

describe('errorMiddleware', () => {
  it('handles AppError with correct status and code', () => {
    const res = mockRes();
    errorMiddleware(new NotFoundError('Website'), req, res, next);
    expect((res as any).status).toHaveBeenCalledWith(404);
    expect((res as any)._json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'NOT_FOUND', message: 'Website not found' }),
    );
  });

  it('handles 401 UnauthorizedError', () => {
    const res = mockRes();
    errorMiddleware(new UnauthorizedError(), req, res, next);
    expect((res as any).status).toHaveBeenCalledWith(401);
  });

  it('handles ZodError as 422 with field details', () => {
    const res = mockRes();
    let zodError: ZodError;
    try {
      z.object({ name: z.string() }).parse({ name: 123 });
    } catch (e) {
      zodError = e as ZodError;
    }
    errorMiddleware(zodError!, req, res, next);
    expect((res as any).status).toHaveBeenCalledWith(422);
    expect((res as any)._json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'VALIDATION_ERROR' }),
    );
  });

  it('handles pg unique violation (code 23505) as 409', () => {
    const res = mockRes();
    errorMiddleware({ code: '23505' }, req, res, next);
    expect((res as any).status).toHaveBeenCalledWith(409);
  });

  it('handles unknown errors as 500', () => {
    const res = mockRes();
    errorMiddleware(new Error('unexpected'), req, res, next);
    expect((res as any).status).toHaveBeenCalledWith(500);
    expect((res as any)._json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INTERNAL_SERVER_ERROR' }),
    );
  });
});
