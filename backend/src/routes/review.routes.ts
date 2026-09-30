import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireCustomerAuth, requireEmployeeAuth, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError, ForbiddenError } from '../utils/errors';

const router = Router();

const reviewSchema = z.object({
  orderId: z.string().uuid(),
  itemRating: z.number().int().min(1).max(5).optional(),
  restaurantRating: z.number().int().min(1).max(5).optional(),
  text: z.string().max(1000).optional(),
});

// Only a customer whose own COMPLETED order this is may review it, and only once.
router.post(
  '/',
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    const data = reviewSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order || order.customerId !== req.customer!.customerId) throw new ForbiddenError('You can only review your own orders.');
    if (!['SERVED', 'COMPLETED'].includes(order.status)) throw new AppError('You can review an order once it has been served.', 400);

    const existing = await prisma.review.findFirst({ where: { orderId: data.orderId, customerId: req.customer!.customerId } });
    if (existing) throw new AppError('You have already reviewed this order.', 400);

    const review = await prisma.review.create({
      data: {
        customerId: req.customer!.customerId,
        orderId: data.orderId,
        itemRating: data.itemRating,
        restaurantRating: data.restaurantRating,
        text: data.text,
      },
    });
    res.status(201).json({ review });
  })
);

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const onlyApproved = !req.employee;
    const reviews = await prisma.review.findMany({
      where: onlyApproved ? { approved: true } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ reviews });
  })
);

router.patch(
  '/:id',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const approved = z.boolean().parse(req.body.approved);
    const review = await prisma.review.update({ where: { id: req.params.id }, data: { approved } });
    res.json({ review });
  })
);

export default router;
