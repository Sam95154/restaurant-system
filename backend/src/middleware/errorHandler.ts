import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';

// Central error handler - never leaks stack traces or raw DB errors to clients (spec section 66).
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err && typeof err === 'object' && 'issues' in (err as any)) {
    // zod validation error
    return res.status(400).json({ error: 'Invalid request data.', details: (err as any).issues });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
