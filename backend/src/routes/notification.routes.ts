import { Router } from 'express';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth, requireCustomerAuth } from '../middleware/auth';

const router = Router();

router.get(
  '/employee',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.employee!.employeeId, userType: 'EMPLOYEE' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ notifications });
  })
);

router.get(
  '/customer',
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.customer!.customerId, userType: 'CUSTOMER' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ notifications });
  })
);

router.patch(
  '/:id/read',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
    res.json({ notification });
  })
);

export default router;
