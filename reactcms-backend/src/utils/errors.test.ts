import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from './errors';

describe('error classes', () => {
  it('BadRequestError has status 400', () => {
    const e = new BadRequestError('bad input');
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe('BAD_REQUEST');
    expect(e instanceof AppError).toBe(true);
  });

  it('UnauthorizedError has status 401 and default message', () => {
    const e = new UnauthorizedError();
    expect(e.statusCode).toBe(401);
    expect(e.message).toBe('Unauthorized');
  });

  it('ForbiddenError has status 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });

  it('NotFoundError formats resource name', () => {
    const e = new NotFoundError('Website');
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe('Website not found');
  });

  it('ConflictError has status 409', () => {
    expect(new ConflictError('already exists').statusCode).toBe(409);
  });

  it('ValidationError has status 422 and stores details', () => {
    const e = new ValidationError({ field: ['required'] });
    expect(e.statusCode).toBe(422);
    expect(e.details).toMatchObject({ field: ['required'] });
  });
});
