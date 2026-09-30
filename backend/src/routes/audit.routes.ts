import { Router } from 'express';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();

router.get(
  '/',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
    res.json({ logs });
  })
);

export default router;
