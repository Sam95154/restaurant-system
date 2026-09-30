import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../utils/errors';
import { EmployeeTokenPayload, CustomerTokenPayload, verifyToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      employee?: EmployeeTokenPayload;
      customer?: CustomerTokenPayload;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies?.token) return req.cookies.token;
  return null;
}

// Requires a valid employee (staff) token. Attaches req.employee.
export function requireEmployeeAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) throw new UnauthorizedError('Login required.');
  const payload = verifyToken(token);
  if (payload.kind !== 'employee') throw new UnauthorizedError('An employee login is required for this action.');
  req.employee = payload;
  next();
}

// Requires a valid customer token. Attaches req.customer.
export function requireCustomerAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) throw new UnauthorizedError('Login required.');
  const payload = verifyToken(token);
  if (payload.kind !== 'customer') throw new UnauthorizedError('A customer login is required for this action.');
  req.customer = payload;
  next();
}

// Optional auth: attaches employee/customer if a valid token is present, but never rejects.
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload.kind === 'employee') req.employee = payload;
      if (payload.kind === 'customer') req.customer = payload;
    } catch {
      // ignore invalid/expired token for optional auth
    }
  }
  next();
}
