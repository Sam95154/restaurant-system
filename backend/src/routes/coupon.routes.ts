import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import {
  requireEmployeeAuth,
  requireCustomerAuth,
} from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { priceCoupon } from '../services/pricing.service';
import { logAudit } from '../services/audit.service';

const router = Router();

/* =========================================================
   VALIDATION
========================================================= */

const couponSchema = z.object({
  code: z.string().trim().min(3).max(50),
  description: z.string().trim().max(500).optional(),
  discountType: z.enum([
    'PERCENTAGE',
    'FIXED_AMOUNT',
  ]),
  discountValue: z.number().positive(),
  minOrder: z.number().min(0).default(0),
  maxDiscount: z.number().positive().optional(),
  startDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  usageLimit: z.number().int().positive().optional(),
  perCustomerLimit: z.number().int().positive().optional(),
  branchId: z.string().uuid().optional(),
});

const updateCouponSchema = couponSchema.partial().extend({
  code: z.string().trim().min(3).max(50).optional(),
});

const statusSchema = z.object({
  status: z.enum([
    'ACTIVE',
    'INACTIVE',
  ]),
});

const validateSchema = z.object({
  code: z.string().min(1),
  branchId: z.string().uuid(),
  subtotal: z.number().nonnegative(),
});

/* =========================================================
   HELPERS
========================================================= */

async function getCouponOrThrow(id: string) {
  return prisma.coupon.findUnique({
    where: { id },
    include: {
      branch: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          usages: true,
          orders: true,
        },
      },
    },
  });
}

function verifyCouponBranchAccess(
  employee: {
    employeeId: string;
    role: string;
    branchId: string | null;
  },
  couponBranchId: string | null,
) {
  if (employee.role === 'SUPER_ADMIN') {
    return;
  }

  if (
    employee.role === 'MANAGER' &&
    couponBranchId !== null &&
    couponBranchId !== employee.branchId
  ) {
    throw new Error(
      'You do not have access to this coupon.',
    );
  }
}

/* =========================================================
   CREATE COUPON
========================================================= */

router.post(
  '/',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN'
    
  ),
  asyncHandler(async (req, res) => {
    const data = couponSchema.parse(req.body);

    if (data.expiryDate <= data.startDate) {
      return res.status(400).json({
        message:
          'Expiry date must be later than the start date.',
      });
    }

    if (
      data.discountType === 'PERCENTAGE' &&
      data.discountValue > 100
    ) {
      return res.status(400).json({
        message:
          'Percentage discount cannot exceed 100%.',
      });
    }

    if (
      req.employee!.role === 'MANAGER'
    ) {
      if (!req.employee!.branchId) {
        return res.status(403).json({
          message:
            'Manager is not assigned to a branch.',
        });
      }

      if (
        data.branchId &&
        data.branchId !== req.employee!.branchId
      ) {
        return res.status(403).json({
          message:
            'Manager can only create coupons for their own branch.',
        });
      }
    }

    const code = data.code.toUpperCase();

    const existing = await prisma.coupon.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      return res.status(409).json({
        message:
          'A coupon with this code already exists.',
      });
    }

    const coupon = await prisma.coupon.create({
      data: {
        ...data,
        code,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      userRole: req.employee!.role,
      action: 'CREATE_COUPON',
      entity: 'Coupon',
      entityId: coupon.id,
      metadata: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue.toString(),
        branchId: coupon.branchId,
      },
    });

    res.status(201).json({
      coupon,
    });
  }),
);

/* =========================================================
   LIST COUPONS
========================================================= */

router.get(
  '/',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN',
    'MANAGER',
  ),
  asyncHandler(async (req, res) => {
    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim()
        : '';

    const status =
      req.query.status === 'ACTIVE' ||
      req.query.status === 'INACTIVE'
        ? req.query.status
        : undefined;

    const branchId =
      typeof req.query.branchId === 'string'
        ? req.query.branchId
        : undefined;

    const where: Prisma.CouponWhereInput = {};

    if (search) {
      where.OR = [
        {
          code: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (
      req.employee!.role === 'MANAGER'
    ) {
      where.OR = [
        ...(Array.isArray(where.OR)
          ? where.OR
          : []),
        {
          branchId: req.employee!.branchId,
        },
        {
          branchId: null,
        },
      ];

      if (
        branchId &&
        branchId !== req.employee!.branchId
      ) {
        return res.status(403).json({
          message:
            'You do not have access to this branch.',
        });
      }
    } else if (branchId) {
      where.branchId = branchId;
    }

    const coupons = await prisma.coupon.findMany({
      where,
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            usages: true,
            orders: true,
          },
        },
      },
      orderBy: {
        startDate: 'desc',
      },
    });

    res.json({
      coupons,
    });
  }),
);

/* =========================================================
   CUSTOMER-FACING AVAILABLE COUPONS
   Public endpoint used by the QR customer ordering page.
========================================================= */

router.get(
  '/available',
  asyncHandler(async (req, res) => {
    const branchQuery = req.query.branchId;

    if (
      branchQuery !== undefined &&
      (typeof branchQuery !== 'string' ||
        !z.string().uuid().safeParse(branchQuery).success)
    ) {
      return res.status(400).json({
        message: 'Invalid branchId.',
      });
    }

    const branchId =
      typeof branchQuery === 'string' ? branchQuery : undefined;

    const now = new Date();

    const coupons = await prisma.coupon.findMany({
      where: {
        status: 'ACTIVE',
        startDate: {
          lte: now,
        },
        expiryDate: {
          gte: now,
        },
        ...(branchId
          ? {
              OR: [
                {
                  branchId,
                },
                {
                  branchId: null,
                },
              ],
            }
          : {
              branchId: null,
            }),
      },
      select: {
        id: true,
        code: true,
        description: true,
        discountType: true,
        discountValue: true,
        minOrder: true,
        maxDiscount: true,
        startDate: true,
        expiryDate: true,
        usageLimit: true,
        perCustomerLimit: true,
        branchId: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        expiryDate: 'asc',
      },
    });

    res.json({
      coupons,
    });
  }),
);

/* =========================================================
   GET SINGLE COUPON
========================================================= */

router.get(
  '/:id',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN',
    'MANAGER',
  ),
  asyncHandler(async (req, res) => {
    const coupon = await getCouponOrThrow(
      req.params.id,
    );

    if (!coupon) {
      return res.status(404).json({
        message: 'Coupon not found.',
      });
    }

    verifyCouponBranchAccess(
      req.employee!,
      coupon.branchId,
    );

    res.json({
      coupon,
    });
  }),
);

/* =========================================================
   UPDATE COUPON
========================================================= */

router.put(
  '/:id',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN'
  ),
  asyncHandler(async (req, res) => {
    const existing = await prisma.coupon.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      return res.status(404).json({
        message: 'Coupon not found.',
      });
    }

    verifyCouponBranchAccess(
      req.employee!,
      existing.branchId,
    );

    const data =
      updateCouponSchema.parse(req.body);

    const nextStartDate =
      data.startDate ??
      existing.startDate;

    const nextExpiryDate =
      data.expiryDate ??
      existing.expiryDate;

    if (
      nextExpiryDate <= nextStartDate
    ) {
      return res.status(400).json({
        message:
          'Expiry date must be later than the start date.',
      });
    }

    const nextDiscountType =
      data.discountType ??
      existing.discountType;

    const nextDiscountValue =
      data.discountValue ??
      Number(existing.discountValue);

    if (
      nextDiscountType === 'PERCENTAGE' &&
      nextDiscountValue > 100
    ) {
      return res.status(400).json({
        message:
          'Percentage discount cannot exceed 100%.',
      });
    }

    if (
      req.employee!.role === 'MANAGER'
    ) {
      const requestedBranchId =
        data.branchId ??
        existing.branchId;

      if (
        requestedBranchId !== null &&
        requestedBranchId !==
          req.employee!.branchId
      ) {
        return res.status(403).json({
          message:
            'Manager can only manage coupons for their own branch.',
        });
      }
    }

    let code:
      | string
      | undefined;

    if (data.code) {
      code = data.code.toUpperCase();

      const duplicate =
        await prisma.coupon.findFirst({
          where: {
            code,
            NOT: {
              id: existing.id,
            },
          },
          select: {
            id: true,
          },
        });

      if (duplicate) {
        return res.status(409).json({
          message:
            'A coupon with this code already exists.',
        });
      }
    }

    const updateData: Prisma.CouponUpdateInput =
      {
        ...(data.description !== undefined
          ? {
              description:
                data.description,
            }
          : {}),
        ...(data.discountType !== undefined
          ? {
              discountType:
                data.discountType,
            }
          : {}),
        ...(data.discountValue !== undefined
          ? {
              discountValue:
                data.discountValue,
            }
          : {}),
        ...(data.minOrder !== undefined
          ? {
              minOrder:
                data.minOrder,
            }
          : {}),
        ...(data.maxDiscount !== undefined
          ? {
              maxDiscount:
                data.maxDiscount,
            }
          : {}),
        ...(data.startDate !== undefined
          ? {
              startDate:
                data.startDate,
            }
          : {}),
        ...(data.expiryDate !== undefined
          ? {
              expiryDate:
                data.expiryDate,
            }
          : {}),
        ...(data.usageLimit !== undefined
          ? {
              usageLimit:
                data.usageLimit,
            }
          : {}),
        ...(data.perCustomerLimit !==
        undefined
          ? {
              perCustomerLimit:
                data.perCustomerLimit,
            }
          : {}),
        ...(data.branchId !== undefined
          ? {
              branch: data.branchId
                ? {
                    connect: {
                      id: data.branchId,
                    },
                  }
                : {
                    disconnect: true,
                  },
            }
          : {}),
        ...(code
          ? {
              code,
            }
          : {}),
      };

    const coupon =
      await prisma.coupon.update({
        where: {
          id: existing.id,
        },
        data: updateData,
        include: {
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    await logAudit({
      userId:
        req.employee!.employeeId,
      userRole:
        req.employee!.role,
      action: 'UPDATE_COUPON',
      entity: 'Coupon',
      entityId: coupon.id,
      metadata: {
        code: coupon.code,
      },
    });

    res.json({
      coupon,
    });
  }),
);

/* =========================================================
   ACTIVATE / DEACTIVATE
========================================================= */

router.patch(
  '/:id/status',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN'
    
  ),
  asyncHandler(async (req, res) => {
    const { status } =
  statusSchema.parse(req.body);

    const existing =
      await prisma.coupon.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!existing) {
      return res.status(404).json({
        message: 'Coupon not found.',
      });
    }

    verifyCouponBranchAccess(
      req.employee!,
      existing.branchId,
    );

    const coupon =
      await prisma.coupon.update({
        where: {
          id: existing.id,
        },
        data: {
          status,
        },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    await logAudit({
      userId:
        req.employee!.employeeId,
      userRole:
        req.employee!.role,
      action:
        status === 'ACTIVE'
          ? 'ACTIVATE_COUPON'
          : 'DEACTIVATE_COUPON',
      entity: 'Coupon',
      entityId: coupon.id,
      metadata: {
        code: coupon.code,
        status,
      },
    });

    res.json({
      coupon,
    });
  }),
);

/* =========================================================
   DELETE COUPON
========================================================= */

router.delete(
  '/:id',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN'
  
  ),
  asyncHandler(async (req, res) => {
    const existing =
      await prisma.coupon.findUnique({
        where: {
          id: req.params.id,
        },
        include: {
          _count: {
            select: {
              usages: true,
              orders: true,
            },
          },
        },
      });

    if (!existing) {
      return res.status(404).json({
        message: 'Coupon not found.',
      });
    }

    verifyCouponBranchAccess(
      req.employee!,
      existing.branchId,
    );

    /*
     * Do not delete coupons that are already
     * referenced by orders or usage history.
     * Deactivate them instead.
     */
    if (
      existing._count.usages > 0 ||
      existing._count.orders > 0
    ) {
      return res.status(409).json({
        message:
          'This coupon has usage or order history and cannot be deleted. Deactivate it instead.',
      });
    }

    await prisma.coupon.delete({
      where: {
        id: existing.id,
      },
    });

    await logAudit({
      userId:
        req.employee!.employeeId,
      userRole:
        req.employee!.role,
      action: 'DELETE_COUPON',
      entity: 'Coupon',
      entityId: existing.id,
      metadata: {
        code: existing.code,
      },
    });

    res.json({
      success: true,
      message: 'Coupon deleted successfully.',
    });
  }),
);

/* =========================================================
   COUPON USAGE / HISTORY
========================================================= */

router.get(
  '/:id/usage',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN',
    'MANAGER',
  ),
  asyncHandler(async (req, res) => {
    const coupon =
      await prisma.coupon.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!coupon) {
      return res.status(404).json({
        message: 'Coupon not found.',
      });
    }

    verifyCouponBranchAccess(
      req.employee!,
      coupon.branchId,
    );

    const usages =
      await prisma.couponUsage.findMany({
        where: {
          couponId: coupon.id,
        },
        orderBy: {
          usedAt: 'desc',
        },
      });

    res.json({
      summary: {
        usageCount: usages.length,
        usageLimit: coupon.usageLimit,
        remaining:
          coupon.usageLimit === null
            ? null
            : Math.max(
                0,
                coupon.usageLimit -
                  usages.length,
              ),
      },
      usages,
    });
  }),
);

/* =========================================================
   CUSTOMER-FACING VALIDATION
========================================================= */

router.post(
  '/validate',
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    const {
      code,
      branchId,
      subtotal,
    } = validateSchema.parse(req.body);

    const {
      coupon,
      discount,
    } = await priceCoupon(
      code,
      branchId,
      new Prisma.Decimal(subtotal),
      req.customer!.customerId,
    );

    res.json({
      valid: true,
      discount: discount.toString(),
      coupon: {
        code: coupon.code,
        discountType:
          coupon.discountType,
      },
    });
  }),
);

export default router;