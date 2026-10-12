import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireCustomerAuth, requireEmployeeAuth, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError, ForbiddenError } from '../utils/errors';
import { verifyToken } from '../utils/jwt';

const router = Router();

const reviewSchema = z.object({
  orderId: z.string().uuid(),
  qrToken: z.string().optional(),
  itemRating: z.number().int().min(1).max(5).optional(),
  restaurantRating: z.number().int().min(1).max(5).optional(),
  text: z.string().trim().max(1000).optional(),
}).refine((data) => data.itemRating !== undefined || data.restaurantRating !== undefined, {
  message: 'Please provide a star rating.',
});

// Only a customer whose own SERVED/COMPLETED order this is may review it, and only once.
router.post(
  '/',
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    const data = reviewSchema.parse(req.body);
    let customerId = req.customer?.customerId;

    // Public QR orders use a signed, order-specific token so customers do not
    // need to create an account just to leave feedback.
    if (!customerId && data.qrToken) {
      try {
        const token = verifyToken(data.qrToken);
        if (token.kind !== 'qr_order' || token.orderId !== data.orderId) {
          throw new Error('Invalid QR order token');
        }
      } catch {
        throw new ForbiddenError('Your order review session has expired. Please ask staff for help.');
      }
    } else if (!customerId) {
      throw new ForbiddenError('A valid order review session is required.');
    }

    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order || !order.customerId || (customerId && order.customerId !== customerId)) {
      throw new ForbiddenError('You can only review your own orders.');
    }
    customerId = order.customerId;
    if (!['SERVED', 'COMPLETED'].includes(order.status)) throw new AppError('You can review an order once it has been served.', 400);

    const existing = await prisma.review.findFirst({ where: { orderId: data.orderId } });
    if (existing) throw new AppError('You have already reviewed this order.', 400);

    const review = await prisma.review.create({
      data: {
        customerId,
        orderId: data.orderId,
        itemRating: data.itemRating,
        restaurantRating: data.restaurantRating,
        text: data.text,
      },
    });
    res.status(201).json({ review });
  })
);

// Customers see approved reviews. Managers see reviews from their assigned branch only.
// Super admins may select a branch with ?branchId=<id>, or see all branches.
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const employee = req.employee;
    const requestedBranchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;

    if (employee && employee.role !== 'SUPER_ADMIN' && employee.role !== 'MANAGER') {
      throw new ForbiddenError('You do not have permission to view staff reviews.');
    }

    let scopedOrderIds: string[] | undefined;
    if (employee?.role === 'MANAGER') {
      if (!employee.branchId) throw new ForbiddenError('Your account is not assigned to a branch.');
      const orders = await prisma.order.findMany({
        where: { branchId: employee.branchId },
        select: { id: true },
      });
      scopedOrderIds = orders.map((order) => order.id);
    } else if (employee?.role === 'SUPER_ADMIN' && requestedBranchId) {
      const orders = await prisma.order.findMany({
        where: { branchId: requestedBranchId },
        select: { id: true },
      });
      scopedOrderIds = orders.map((order) => order.id);
    }

    const reviews = await prisma.review.findMany({
      where: {
        ...(employee ? {} : { approved: true }),
        ...(scopedOrderIds ? { orderId: { in: scopedOrderIds } } : {}),
        ...(employee?.role === 'SUPER_ADMIN' && !requestedBranchId ? {} : {}),
      },
      include: {
        customer: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const orderIds = [...new Set(reviews.map((review) => review.orderId).filter((id): id is string => !!id))];
    const orders = orderIds.length
      ? await prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: {
            id: true,
            orderNumber: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
          },
        })
      : [];
    const orderById = new Map(orders.map((order) => [order.id, order]));

    res.json({
      reviews: reviews.map((review) => ({
        ...review,
        order: review.orderId ? orderById.get(review.orderId) ?? null : null,
      })),
    });
  })
);

router.patch(
  '/:id',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const approved = z.boolean().parse(req.body.approved);
    const existing = await prisma.review.findUnique({ where: { id: req.params.id }, select: { id: true, orderId: true } });
    if (!existing) throw new AppError('Review not found.', 404);

    if (req.employee!.role === 'MANAGER') {
      if (!req.employee!.branchId || !existing.orderId) throw new ForbiddenError('You can only moderate reviews for your own branch.');
      const order = await prisma.order.findUnique({ where: { id: existing.orderId }, select: { branchId: true } });
      if (!order || order.branchId !== req.employee!.branchId) throw new ForbiddenError('You can only moderate reviews for your own branch.');
    }

    const review = await prisma.review.update({ where: { id: req.params.id }, data: { approved } });
    res.json({ review });
  })
);

export default router;
