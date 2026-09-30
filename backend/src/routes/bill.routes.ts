import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors';
import { logAudit } from '../services/audit.service';
import { priceCoupon } from '../services/pricing.service';
import { getIO } from '../sockets';
import { verifyToken } from '../utils/jwt';

const router = Router();

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
|
| DINE-IN:
|   { tableSessionId: "..." }
|
| TAKEAWAY:
|   { orderId: "..." }
|
| Exactly one source must be supplied.
|
*/
const finalizeQrBillSchema = z.object({
  couponCode: z.string().trim().min(1).max(50).optional(),
});

const generateSchema = z
  .object({
    tableSessionId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.tableSessionId) !== Boolean(data.orderId),
    {
      message:
        'Provide either tableSessionId or orderId, but not both.',
    }
  );

/*
|--------------------------------------------------------------------------
| Helper: employee branch authorization
|--------------------------------------------------------------------------
*/

function assertBranchAccess(
  employee: {
    employeeId: string;
    role: string;
    branchId?: string | null;
  },
  branchId: string
) {
  if (
    employee.role !== 'SUPER_ADMIN' &&
    employee.branchId !== branchId
  ) {
    throw new ForbiddenError();
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/bills/generate
|--------------------------------------------------------------------------
|
| DINE-IN:
|   Generate one bill from all eligible orders in a table session.
|
| TAKEAWAY:
|   Generate one bill for one eligible takeaway order.
|
|--------------------------------------------------------------------------
*/

router.post(
  '/generate',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN',
    'MANAGER',
    'BILLING_EMPLOYEE'
  ),
  asyncHandler(async (req, res) => {
    const { tableSessionId, orderId } =
      generateSchema.parse(req.body);

    /*
    |--------------------------------------------------------------------------
    | DINE-IN BILL
    |--------------------------------------------------------------------------
    */

    if (tableSessionId) {
      const bill = await prisma.$transaction(
        async (tx) => {
          const session =
            await tx.tableSession.findUnique({
              where: {
                id: tableSessionId,
              },
              include: {
                table: true,
                orders: {
                  include: {
                    billItems: true,
                  },
                },
              },
            });

          if (!session) {
            throw new NotFoundError(
              'Table session not found.'
            );
          }

          /*
          * Verify employee branch access.
          */
          assertBranchAccess(
            req.employee!,
            session.table.branchId
          );

          /*
          * Session must still be open.
          */
          if (session.status !== 'OPEN') {
            throw new AppError(
              'This table session is already closed.',
              400
            );
          }

          /*
          * Only SERVED / COMPLETED orders that have
          * not already been attached to a bill.
          */
          const eligibleOrders =
            session.orders.filter(
              (order) =>
                (
                  order.status === 'SERVED' ||
                  order.status === 'COMPLETED'
                ) &&
                order.billItems.length === 0
            );

          if (eligibleOrders.length === 0) {
            throw new AppError(
              'No served, unbilled orders found for this table session.',
              400
            );
          }

          /*
          * Calculate totals from backend order values.
          * Never trust frontend totals.
          */
          const subtotal =
            eligibleOrders.reduce(
              (sum, order) =>
                sum.add(order.subtotal),
              new Prisma.Decimal(0)
            );

          const discount =
            eligibleOrders.reduce(
              (sum, order) =>
                sum.add(order.discountAmount),
              new Prisma.Decimal(0)
            );

          const tax =
            eligibleOrders.reduce(
              (sum, order) =>
                sum.add(order.taxAmount),
              new Prisma.Decimal(0)
            );

          const total = subtotal
            .sub(discount)
            .add(tax);

          /*
          * Create bill and bill items in the same
          * database transaction.
          */
          const created =
            await tx.bill.create({
              data: {
                tableSessionId:
                  session.id,

                subtotal,
                discount,
                tax,
                total,

                generatedById:
                  req.employee!.employeeId,

                items: {
                  create:
                    eligibleOrders.map(
                      (order) => ({
                        orderId: order.id,
                      })
                    ),
                },
              },

              include: {
                items: true,
                payments: true,
                tableSession: {
                  include: {
                    table: true,
                  },
                },
              },
            });

          return {
            bill: created,
            orderIds:
              eligibleOrders.map(
                (order) => order.id
              ),
          };
        }
      );

      /*
      * Audit after successful transaction.
      */
      await logAudit({
        userId:
          req.employee!.employeeId,

        action: 'GENERATE_BILL',

        entity: 'Bill',

        entityId:
          bill.bill.id,

        metadata: {
          tableSessionId,
          orderIds: bill.orderIds,
        },
      });

      /*
      * Notify customers associated with the orders.
      */
      const customerOrders =
        await prisma.order.findMany({
          where: {
            id: {
              in: bill.orderIds,
            },
          },

          select: {
            customerId: true,
          },
        });

      const io = getIO();

      if (io) {
        for (const order of customerOrders) {
          if (order.customerId) {
            io
              .to(
                `customer:${order.customerId}`
              )
              .emit(
                'bill.created',
                bill.bill
              );
          }
        }
      }

      return res.status(201).json({
        bill: bill.bill,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | TAKEAWAY BILL
    |--------------------------------------------------------------------------
    */

    const result =
      await prisma.$transaction(
        async (tx) => {
          const order =
            await tx.order.findUnique({
              where: {
                id: orderId!,
              },

              include: {
                branch: true,
                items: true,
                billItems: true,
                customer: true,
              },
            });

          if (!order) {
            throw new NotFoundError(
              'Order not found.'
            );
          }

          /*
          * Verify branch authorization.
          */
          assertBranchAccess(
            req.employee!,
            order.branchId
          );

          /*
          * Only takeaway orders can use
          * standalone order billing.
          */
          if (order.type !== 'TAKEAWAY') {
            throw new AppError(
              'Only takeaway orders can be billed without a table session.',
              400
            );
          }

          /*
          * Order must be ready for billing.
          */
          if (
            order.status !== 'SERVED' &&
            order.status !== 'COMPLETED'
          ) {
            throw new AppError(
              'Takeaway order must be SERVED or COMPLETED before billing.',
              400
            );
          }

          /*
          * Prevent duplicate billing.
          */
          if (order.billItems.length > 0) {
            throw new AppError(
              'This takeaway order has already been billed.',
              400
            );
          }

          if (order.items.length === 0) {
            throw new AppError(
              'Cannot generate a bill for an order without items.',
              400
            );
          }

          /*
          * Use the backend order totals.
          */
          const subtotal =
            order.subtotal;

          const discount =
            order.discountAmount;

          const tax =
            order.taxAmount;

          const total =
            subtotal
              .sub(discount)
              .add(tax);

          /*
          * Create bill + bill item atomically.
          */
          const created =
            await tx.bill.create({
              data: {
                subtotal,
                discount,
                tax,
                total,

                generatedById:
                  req.employee!.employeeId,

                tableSessionId:
                  null,

                items: {
                  create: {
                    orderId:
                      order.id,
                  },
                },
              },

              include: {
                items: true,
                payments: true,
                tableSession: {
                  include: {
                    table: true,
                  },
                },
              },
            });

          return {
            bill: created,
            customerId:
              order.customerId,
          };
        }
      );

    /*
    * Audit successful takeaway bill.
    */
    await logAudit({
      userId:
        req.employee!.employeeId,

      action: 'GENERATE_BILL',

      entity: 'Bill',

      entityId:
        result.bill.id,

      metadata: {
        orderId,
        type: 'TAKEAWAY',
      },
    });

    /*
    * Notify customer if this order belongs
    * to a customer.
    */
    const io = getIO();

    if (
      io &&
      result.customerId
    ) {
      io
        .to(
          `customer:${result.customerId}`
        )
        .emit(
          'bill.created',
          result.bill
        );
    }

    return res.status(201).json({
      bill: result.bill,
    });
  })
);


/*
|--------------------------------------------------------------------------
| POST /api/bills/qr/:token/finalize
|--------------------------------------------------------------------------
| Public customer final-bill generation for a QR/self-service table session.
| One table session produces one combined bill from all served/completed,
| previously unbilled orders. Coupon is applied only at this final stage.
|--------------------------------------------------------------------------
*/

router.post(
  '/qr/:token/finalize',
  asyncHandler(async (req, res) => {
    let payload: ReturnType<typeof verifyToken>;

    try {
      payload = verifyToken(req.params.token);
    } catch {
      throw new ForbiddenError(
        'Invalid or expired QR bill token.'
      );
    }

    if (
      payload.kind !== 'qr_order' ||
      !payload.orderId
    ) {
      throw new ForbiddenError(
        'Invalid QR bill token.'
      );
    }

    const { couponCode } =
      finalizeQrBillSchema.parse(req.body ?? {});

    const result = await prisma.$transaction(
      async (tx) => {
        const qrOrder =
          await tx.order.findUnique({
            where: {
              id: payload.orderId!,
            },
            include: {
              tableSession: {
                include: {
                  table: true,
                },
              },
            },
          });

        if (!qrOrder) {
          throw new NotFoundError(
            'QR order not found.'
          );
        }

        if (qrOrder.type !== 'SELF_ORDER') {
          throw new ForbiddenError(
            'This is not a QR customer order.'
          );
        }

        if (!qrOrder.tableSessionId || !qrOrder.tableSession) {
          throw new AppError(
            'This QR order is not attached to a table session.',
            400
          );
        }

        if (qrOrder.status !== 'COMPLETED') {
          throw new AppError(
            'The order has not completed yet.',
            400
          );
        }

        const sessionId = qrOrder.tableSessionId;

        /*
         * If a bill already exists for this session, return it rather than
         * creating a second bill. This makes repeated customer clicks safe.
         */
        const existingBill =
          await tx.bill.findFirst({
            where: {
              tableSessionId: sessionId,
            },
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              items: true,
              payments: true,
              tableSession: {
                include: {
                  table: true,
                },
              },
            },
          });

        if (existingBill) {
          return {
            bill: existingBill,
            orderIds: existingBill.items.map(
              (item) => item.orderId
            ),
            created: false,
          };
        }

        if (qrOrder.tableSession.status !== 'OPEN') {
          throw new AppError(
            'This table session is already closed.',
            400
          );
        }

        const sessionOrders =
          await tx.order.findMany({
            where: {
              tableSessionId: sessionId,
              status: {
                in: ['SERVED', 'COMPLETED'],
              },
            },
            include: {
              billItems: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          });

        const eligibleOrders =
          sessionOrders.filter(
            (order) =>
              order.billItems.length === 0
          );

        if (eligibleOrders.length === 0) {
          throw new AppError(
            'No served, unbilled orders found for this table session.',
            400
          );
        }

        const subtotal =
          eligibleOrders.reduce(
            (sum, order) =>
              sum.add(order.subtotal),
            new Prisma.Decimal(0)
          );

        const existingOrderDiscount =
          eligibleOrders.reduce(
            (sum, order) =>
              sum.add(order.discountAmount),
            new Prisma.Decimal(0)
          );

        const tax =
          eligibleOrders.reduce(
            (sum, order) =>
              sum.add(order.taxAmount),
            new Prisma.Decimal(0)
          );

        let couponDiscount =
          new Prisma.Decimal(0);

        let couponId: string | null = null;

        if (couponCode) {
          const couponResult =
            await priceCoupon(
              couponCode,
              qrOrder.branchId,
              subtotal.sub(existingOrderDiscount),
              qrOrder.customerId ?? undefined
            );

          couponDiscount =
            couponResult.discount;
          couponId = couponResult.coupon.id;
        }

        const totalDiscount =
          existingOrderDiscount.add(
            couponDiscount
          );

        const total = subtotal
          .sub(totalDiscount)
          .add(tax);

        if (total.lessThan(0)) {
          throw new AppError(
            'Final bill total cannot be negative.',
            400
          );
        }

        const created =
          await tx.bill.create({
            data: {
              tableSessionId: sessionId,
              subtotal,
              discount: totalDiscount,
              tax,
              total,
              generatedById: null,
              items: {
                create: eligibleOrders.map(
                  (order) => ({
                    orderId: order.id,
                  })
                ),
              },
            },
            include: {
              items: true,
              payments: true,
              tableSession: {
                include: {
                  table: true,
                },
              },
            },
          });

        /*
         * Coupon usage is recorded only after the final bill is created.
         * customerId remains nullable because the QR flow does not require
         * customer login.
         */
        if (couponId) {
          await tx.couponUsage.create({
            data: {
              couponId,
              customerId:
                qrOrder.customerId ?? null,
            },
          });
        }

        return {
          bill: created,
          orderIds: eligibleOrders.map(
            (order) => order.id
          ),
          created: true,
        };
      }
    );

    if (result.created) {
      await logAudit({
        action: 'GENERATE_QR_FINAL_BILL',
        entity: 'Bill',
        entityId: result.bill.id,
        metadata: {
          qrOrderId: payload.orderId,
          tableSessionId:
            result.bill.tableSessionId,
          orderIds: result.orderIds,
          couponApplied: Boolean(couponCode),
          couponCode: couponCode ?? null,
        },
      });
    }

    return res.status(result.created ? 201 : 200).json({
      bill: result.bill,
    });
  })
);


/*
|--------------------------------------------------------------------------
| GET /api/bills/qr/:token
|--------------------------------------------------------------------------
| Public customer bill access for a completed QR/self-service order.
|--------------------------------------------------------------------------
*/

router.get(
  '/qr/:token',
  asyncHandler(async (req, res) => {
    let payload: ReturnType<typeof verifyToken>;

    try {
      payload = verifyToken(req.params.token);
    } catch {
      throw new ForbiddenError(
        'Invalid or expired QR bill token.'
      );
    }

    if (
      payload.kind !== 'qr_order' ||
      !payload.orderId
    ) {
      throw new ForbiddenError(
        'Invalid QR bill token.'
      );
    }

    const bill =
      await prisma.bill.findFirst({
        where: {
          items: {
            some: {
              orderId:
                payload.orderId,
            },
          },
        },

        include: {
          items: {
            include: {
              order: {
                include: {
                  items: true,

                  tableSession: {
                    include: {
                      table: true,
                    },
                  },
                },
              },
            },
          },

          payments: true,

          tableSession: {
            include: {
              table: true,
            },
          },
        },
      });

    if (!bill) {
      throw new NotFoundError(
        'The bill is not ready yet.'
      );
    }

    const qrOrder =
      bill.items.find(
        (billItem) =>
          billItem.orderId ===
          payload.orderId
      )?.order;

    if (!qrOrder) {
      throw new NotFoundError(
        'QR order not found.'
      );
    }

    if (
      qrOrder.type !== 'SELF_ORDER'
    ) {
      throw new ForbiddenError(
        'This bill is not a QR customer bill.'
      );
    }

    if (
      qrOrder.status !== 'COMPLETED'
    ) {
      throw new AppError(
        'The order has not completed yet.',
        400
      );
    }

    res.json({
      bill,
    });
  })
);

/*
|--------------------------------------------------------------------------
| GET /api/bills/:id
|--------------------------------------------------------------------------
|
| Retrieve one complete bill.
|
| Customer:
|   Can only access their own bill.
|
| Employee:
|   Must belong to the bill's branch unless SUPER_ADMIN.
|
|--------------------------------------------------------------------------
*/

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const bill =
      await prisma.bill.findUnique({
        where: {
          id: req.params.id,
        },

        include: {
          items: {
            include: {
              order: {
                include: {
                  items: true,
                  customer: true,
                  branch: true,
                  tableSession: {
                    include: {
                      table: true,
                    },
                  },
                },
              },
            },
          },

          payments: true,

          tableSession: {
            include: {
              table: true,
            },
          },
        },
      });

    if (!bill) {
      throw new NotFoundError(
        'Bill not found.'
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Customer authorization
    |--------------------------------------------------------------------------
    */

    if (req.customer) {
      const belongsToCustomer =
        bill.items.some(
          (billItem) =>
            billItem.order.customerId ===
            req.customer!.customerId
        );

      if (!belongsToCustomer) {
        throw new ForbiddenError();
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Employee authorization
    |--------------------------------------------------------------------------
    */

    if (req.employee) {
      const branchId =
        bill.items[0]?.order.branchId ??
        bill.tableSession?.table.branchId;

      if (!branchId) {
        throw new AppError(
          'Unable to determine bill branch.',
          500
        );
      }

      assertBranchAccess(
        req.employee,
        branchId
      );
    }

    res.json({
      bill,
    });
  })
);

/*
|--------------------------------------------------------------------------
| GET /api/bills
|--------------------------------------------------------------------------
|
| SUPER_ADMIN:
|   Can see all branches.
|
| MANAGER / BILLING_EMPLOYEE:
|   Can only see their own branch.
|
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN',
    'MANAGER',
    'BILLING_EMPLOYEE'
  ),
  asyncHandler(async (req, res) => {
    const where =
      req.employee!.role ===
      'SUPER_ADMIN'
        ? {}
        : {
            OR: [
              {
                tableSession: {
                  table: {
                    branchId:
                      req.employee!
                        .branchId!,
                  },
                },
              },

              {
                items: {
                  some: {
                    order: {
                      branchId:
                        req.employee!
                          .branchId!,
                    },
                  },
                },
              },
            ],
          };

    const bills =
      await prisma.bill.findMany({
        where,

        orderBy: {
          createdAt: 'desc',
        },

        take: 200,

        include: {
          payments: true,

          tableSession: {
            include: {
              table: true,
            },
          },

          items: {
            include: {
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  type: true,
                  status: true,
                  branchId: true,
                  customerId: true,
                },
              },
            },
          },
        },
      });

    res.json({
      bills,
    });
  })
);

export default router;