import { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

/**
 * Restricts a route to specific employee roles.
 * This NEVER trusts anything the client claims about its own role -
 * req.employee.role comes only from the verified JWT (see auth.ts).
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.employee) throw new UnauthorizedError('Login required.');
    if (!roles.includes(req.employee.role)) {
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
    next();
  };
}

/**
 * Restricts a route so a MANAGER (or lower) can only operate on their own
 * assigned branch. SUPER_ADMIN bypasses this check. The branch id is read
 * from params/body/query - never trusted blindly, always compared against
 * the authenticated employee's own branchId from the JWT.
 */
export function requireBranchAccess(getBranchId: (req: Request) => string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.employee) throw new UnauthorizedError('Login required.');
    if (req.employee.role === 'SUPER_ADMIN') return next();

    const requestedBranchId = getBranchId(req);
    if (!requestedBranchId) throw new ForbiddenError('Branch could not be determined for this request.');
    if (req.employee.branchId !== requestedBranchId) {
      throw new ForbiddenError('You do not have access to this branch.');
    }
    next();
  };
}
