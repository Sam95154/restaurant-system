import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import {
  requireEmployeeAuth,
  requireCustomerAuth,
  optionalAuth,
} from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors';
import {
  priceCart,
  priceCoupon,
} from '../services/pricing.service';
import { notify } from '../services/notification.service';
import { logAudit } from '../services/audit.service';
import { getIO } from '../sockets';
import { signQrOrderToken } from '../utils/jwt';
const router = Router();

/* =========================================================
   VALIDATION
========================================================= */

const cartLineSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const orderTypeSchema = z.enum([
  'STAFF_ORDER',
  'SELF_ORDER',
  'TAKEAWAY',
]);

/* =========================================================
   ORDER STATUS TRANSITIONS
========================================================= */

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: [
    'ACCEPTED',
    'CANCELLED',
  ],

  ACCEPTED: [
    'PREPARING',
    'CANCELLED',
  ],

  PREPARING: [
    'READY',
    'CANCELLED',
  ],

  READY: [
    'SERVED',
  ],

  SERVED: [
    'COMPLETED',
  ],

  COMPLETED: [],

  CANCELLED: [],
};

/* =========================================================
   BRANCH ACCESS
========================================================= */

function verifyEmployeeBranchAccess(
  employee: {
    employeeId: string;
    role: string;
    branchId: string | null;
  },
  branchId: string
) {
  if (employee.role === 'SUPER_ADMIN') {
    return;
  }

  if (
    !employee.branchId ||
    employee.branchId !== branchId
  ) {
    throw new ForbiddenError(
      'You do not have access to this branch.'
    );
  }
}

/* =========================================================
   CREATE ORDER CORE
========================================================= */

async function createOrder(params: {
  branchId: string;

  tableId?: string;

  type:
    | 'STAFF_ORDER'
    | 'SELF_ORDER'
    | 'TAKEAWAY';

  lines: {
    itemId: string;
    quantity: number;
  }[];

  couponCode?: string;

  specialInstructions?: string;

  customerId?: string;

  serviceEmployeeId?: string;
}) {
  /*
   * Backend pricing is always the source of truth.
   */
  const {
    pricedLines,
    subtotal,
  } = await priceCart(
    params.branchId,
    params.lines
  );

  /* =======================================================
     COUPON
  ======================================================= */

  let discount = new Prisma.Decimal(0);

  let couponId: string | undefined;

  if (params.couponCode) {
    const result = await priceCoupon(
      params.couponCode,
      params.branchId,
      subtotal,
      params.customerId
    );

    discount = result.discount;
    couponId = result.coupon.id;
  }

  /* =======================================================
     TAX
  ======================================================= */

  /*
   * Central tax configuration is not currently present
   * in the database.
   *
   * Keep tax at zero rather than inventing a tax rate.
   */
  const tax = new Prisma.Decimal(0);

  const total = subtotal
    .sub(discount)
    .add(tax);

  /* =======================================================
     DATABASE TRANSACTION
  ======================================================= */

  const order = await prisma.$transaction(
    async (tx: any) => {
      let tableSessionId: string | undefined;

      /*
       * A table is used only when the order is
       * associated with a restaurant table.
       */
      if (params.tableId) {
        const table =
          await tx.restaurantTable.findUnique({
            where: {
              id: params.tableId,
            },
          });

        if (!table) {
          throw new NotFoundError(
            'Restaurant table not found.'
          );
        }

        /*
         * The table must belong to the same branch
         * as the order.
         */
        if (
          table.branchId !== params.branchId
        ) {
          throw new ForbiddenError(
            'The selected table does not belong to this branch.'
          );
        }

        /*
         * Reuse an existing open table session.
         */
        let session =
          await tx.tableSession.findFirst({
            where: {
              tableId: params.tableId,
              status: 'OPEN',
            },
            orderBy: {
              openedAt: 'desc',
            },
          });

        /*
         * Create a new session when required.
         */
        if (!session) {
          session =
            await tx.tableSession.create({
              data: {
                tableId: params.tableId,
                status: 'OPEN',
              },
            });

          await tx.restaurantTable.update({
            where: {
              id: params.tableId,
            },
            data: {
              status: 'OCCUPIED',
            },
          });
        } else {
          /*
           * Make sure the table is marked occupied
           * when an existing open session is reused.
           */
          await tx.restaurantTable.update({
            where: {
              id: params.tableId,
            },
            data: {
              status: 'OCCUPIED',
            },
          });
        }

        tableSessionId = session.id;
      }

      /* =====================================================
         CREATE ORDER
      ===================================================== */

      const created =
        await tx.order.create({
          data: {
            branchId: params.branchId,

            tableSessionId,

            customerId: params.customerId,

            serviceEmployeeId:
              params.serviceEmployeeId,

            type: params.type,

            specialInstructions:
              params.specialInstructions,

            couponId,

            subtotal,

            discountAmount: discount,

            taxAmount: tax,

            total,

            items: {
              create: pricedLines.map(
                (line) => ({
                  itemId: line.itemId,

                  nameSnapshot:
                    line.nameSnapshot,

                  priceSnapshot:
                    line.priceSnapshot,

                  quantity:
                    line.quantity,
                })
              ),
            },

            statusHistory: {
              create: {
                status: 'PENDING',
              },
            },
          },

          include: {
            items: true,

            tableSession: {
              include: {
                table: true,
              },
            },
          },
        });

      /* =====================================================
         COUPON USAGE
      ===================================================== */

      if (couponId) {
        await tx.couponUsage.create({
          data: {
            couponId,

            customerId:
              params.customerId,
          },
        });
      }

      return created;
    }
  );

  /* =======================================================
     REAL-TIME KITCHEN EVENT
  ======================================================= */

  const io = getIO();

  if (io) {
    io
      .to(
        `branch:${params.branchId}:kitchen`
      )
      .emit(
        'order.created',
        order
      );
  }

  return order;
}

/* =========================================================
   STAFF POS ORDER
========================================================= */

const staffOrderSchema = z.object({
  branchId: z.string().uuid(),

  /*
   * Required for DINE_IN.
   * Not required for TAKEAWAY.
   */
  tableId: z.string().uuid().optional(),

  /*
   * Frontend uses DINE_IN.
   * Database uses STAFF_ORDER for staff dine-in orders.
   */
  type: z
    .enum([
      'DINE_IN',
      'TAKEAWAY',
    ])
    .default('DINE_IN'),

  items: z
    .array(cartLineSchema)
    .min(1),

  couponCode: z
    .string()
    .trim()
    .optional(),

  specialInstructions: z
    .string()
    .trim()
    .max(1000)
    .optional(),
});

router.post(
  '/staff',

  requireEmployeeAuth,

  requireRole(
    'SERVICE_EMPLOYEE',
    'MANAGER',
    'SUPER_ADMIN'
  ),

  asyncHandler(async (req, res) => {
    const data =
      staffOrderSchema.parse(req.body);

    /* =====================================================
       BRANCH SECURITY
    ===================================================== */

    verifyEmployeeBranchAccess(
      req.employee!,
      data.branchId
    );

    /* =====================================================
       DINE-IN VALIDATION
    ===================================================== */

    if (
      data.type === 'DINE_IN' &&
      !data.tableId
    ) {
      throw new AppError(
        'A table is required for dine-in orders.',
        400
      );
    }

    /* =====================================================
       TAKEAWAY VALIDATION
    ===================================================== */

    if (
      data.type === 'TAKEAWAY' &&
      data.tableId
    ) {
      throw new AppError(
        'Takeaway orders cannot be assigned to a restaurant table.',
        400
      );
    }

    /* =====================================================
       CREATE ORDER
    ===================================================== */

    const order =
      await createOrder({
        branchId: data.branchId,

        tableId: data.tableId,

        type:
          data.type === 'TAKEAWAY'
            ? 'TAKEAWAY'
            : 'STAFF_ORDER',

        lines: data.items,

        couponCode:
          data.couponCode,

        specialInstructions:
          data.specialInstructions,

        serviceEmployeeId:
          req.employee!.employeeId,
      });

    /* =====================================================
       AUDIT
    ===================================================== */

    await logAudit({
      userId:
        req.employee!.employeeId,

      action:
        'CREATE_STAFF_ORDER',

      entity:
        'Order',

      entityId:
        order.id,

      metadata: {
        orderType: data.type,
        branchId: data.branchId,
        tableId: data.tableId ?? null,
      },
    });

    res
      .status(201)
      .json({
        order,
      });
  })
);



/* =========================================================
   PUBLIC QR TABLE ORDER
   No customer login required.
========================================================= */

const qrOrderSchema = z.object({
  tableId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(7).max(20),
  items: z.array(cartLineSchema).min(1),
  specialInstructions: z.string().trim().max(1000).optional(),
});

router.post(
  '/qr',

  asyncHandler(async (req, res) => {
    const data = qrOrderSchema.parse(req.body);
    const normalizedPhone = data.customerPhone.replace(/[\\s()-]/g, '');
    if (!/^\\+?[0-9]{7,15}$/.test(normalizedPhone)) {
      throw new AppError('Enter a valid phone number.', 400);
    }

    /* =====================================================
       FIND TABLE
    ===================================================== */

    const table =
      await prisma.restaurantTable.findUnique({
        where: {
          id: data.tableId,
        },

        include: {
          branch: true,
        },
      });

    if (!table) {
      throw new NotFoundError(
        'Restaurant table not found.'
      );
    }

    /* =====================================================
       BRANCH VALIDATION
    ===================================================== */

    if (table.branch.status !== 'OPEN') {
      throw new AppError(
        'This restaurant is currently not accepting orders.',
        400
      );
    }

    /* =====================================================
       TABLE VALIDATION
    ===================================================== */

    if (
      table.status === 'OUT_OF_SERVICE'
    ) {
      throw new AppError(
        'This table is currently unavailable.',
        400
      );
    }

    /* =====================================================
       CREATE ORDER
    ===================================================== */

    const customer = await prisma.customer.upsert({
      where: { phone: normalizedPhone },
      update: { fullName: data.customerName },
      create: { fullName: data.customerName, phone: normalizedPhone },
    });

    const order =
      await createOrder({
        branchId:
          table.branchId,
        customerId: customer.id,

        tableId:
          table.id,

        type:
          'SELF_ORDER',

        lines:
          data.items,

        specialInstructions:
          data.specialInstructions,
      });

    /* =====================================================
       AUDIT
    ===================================================== */

    await logAudit({
      action:
        'CREATE_QR_ORDER',

      entity:
        'Order',

      entityId:
        order.id,

      metadata: {
        branchId:
          table.branchId,

        tableId:
          table.id,

        orderType:
          'SELF_ORDER',
      },
    });

    const qrToken = signQrOrderToken({
      orderId: order.id,
    });

    res
      .status(201)
      .json({
        order,
        qrToken,
      });
  }));
/* =========================================================
   CUSTOMER SELF ORDER
========================================================= */

const selfOrderSchema = z.object({
  branchId: z.string().uuid(),

  tableId: z
    .string()
    .uuid()
    .optional(),

  type: z
    .enum([
      'SELF_ORDER',
      'TAKEAWAY',
    ])
    .default('SELF_ORDER'),

  items: z
    .array(cartLineSchema)
    .min(1),

  couponCode: z
    .string()
    .trim()
    .optional(),
});

router.post(
  '/self',

  requireCustomerAuth,

  asyncHandler(async (req, res) => {
    const data =
      selfOrderSchema.parse(
        req.body
      );

    /* =====================================================
       DINE-IN VALIDATION
    ===================================================== */

    if (
      data.type === 'SELF_ORDER' &&
      !data.tableId
    ) {
      throw new AppError(
        'A table is required for dine-in self orders.',
        400
      );
    }

    /* =====================================================
       TAKEAWAY VALIDATION
    ===================================================== */

    if (
      data.type === 'TAKEAWAY' &&
      data.tableId
    ) {
      throw new AppError(
        'Takeaway orders cannot have a table.',
        400
      );
    }

    /* =====================================================
       CREATE ORDER
    ===================================================== */

    const order =
      await createOrder({
        branchId:
          data.branchId,

        tableId:
          data.tableId,

        type:
          data.type,

        lines:
          data.items,

        couponCode:
          data.couponCode,

        customerId:
          req.customer!.customerId,
      });

    res
      .status(201)
      .json({
        order,
      });
  })
);

/* =========================================================
   KITCHEN DASHBOARD
========================================================= */

router.get(
  '/kitchen',

  requireEmployeeAuth,

  requireRole(
    'KITCHEN_EMPLOYEE',
    'MANAGER',
    'SUPER_ADMIN'
  ),

  asyncHandler(async (req, res) => {
    let branchId: string | null;

    if (
      req.employee!.role ===
      'SUPER_ADMIN'
    ) {
      branchId =
        z
          .string()
          .uuid()
          .parse(
            req.query.branchId
          );
    } else {
      branchId =
        req.employee!.branchId;
    }

    if (!branchId) {
      throw new ForbiddenError(
        'Employee is not assigned to a branch.'
      );
    }

    const orders =
      await prisma.order.findMany({
        where: {
          branchId,

          status: {
            in: [
              'PENDING',
              'ACCEPTED',
              'PREPARING',
              'READY',
            ],
          },
        },

        include: {
          items: true,

          tableSession: {
            include: {
              table: true,
            },
          },
        },

        orderBy: {
          createdAt: 'asc',
        },
      });

    res.json({
      orders,
    });
  })
);

/* =========================================================
   ORDER STATUS TRANSITIONS
========================================================= */

const statusSchema = z.object({
  status: z.enum([
    'PENDING',
    'ACCEPTED',
    'PREPARING',
    'READY',
    'SERVED',
    'COMPLETED',
    'CANCELLED',
  ]),
});

router.patch(
  '/:id/status',

  requireEmployeeAuth,

  requireRole(
    'KITCHEN_EMPLOYEE',
    'SERVICE_EMPLOYEE',
    'MANAGER',
    'SUPER_ADMIN'
  ),

  asyncHandler(async (req, res) => {
    const {
      status: nextStatus,
    } = statusSchema.parse(
      req.body
    );

    const order =
      await prisma.order.findUnique({
        where: {
          id: req.params.id,
        },

        include: {
          tableSession: {
            include: {
              table: true,
            },
          },
        },
      });

    if (!order) {
      throw new NotFoundError(
        'Order not found.'
      );
    }

    /* =====================================================
       BRANCH SECURITY
    ===================================================== */

    if (
      req.employee!.role !==
        'SUPER_ADMIN' &&
      req.employee!.branchId !==
        order.branchId
    ) {
      throw new ForbiddenError(
        'You do not have access to this order.'
      );
    }

    /* =====================================================
       VALID TRANSITION
    ===================================================== */

    const allowed =
      VALID_TRANSITIONS[
        order.status
      ] || [];

    if (
      !allowed.includes(
        nextStatus
      )
    ) {
      throw new AppError(
        `Cannot move an order from ${order.status} to ${nextStatus}.`,
        400
      );
    }

    /* =====================================================
       KITCHEN RESTRICTIONS
    ===================================================== */

    if (
      req.employee!.role ===
      'KITCHEN_EMPLOYEE'
    ) {
      if (
        ![
          'ACCEPTED',
          'PREPARING',
          'READY',
          'CANCELLED',
        ].includes(
          nextStatus
        )
      ) {
        throw new ForbiddenError(
          'Kitchen staff can only accept, prepare, mark orders ready, or cancel orders.'
        );
      }
    }

    /* =====================================================
       UPDATE ORDER
    ===================================================== */

    const updated =
      await prisma.$transaction(
        async (tx: any) => {
          const updatedOrder =
            await tx.order.update({
              where: {
                id: order.id,
              },

              data: {
                status:
                  nextStatus,

                kitchenEmployeeId:
                  nextStatus ===
                  'ACCEPTED'
                    ? req.employee!
                        .employeeId
                    : order.kitchenEmployeeId,
              },

              include: {
                items: true,

                tableSession: {
                  include: {
                    table: true,
                  },
                },
              },
            });

          await tx.orderStatusHistory.create({
            data: {
              orderId:
                order.id,

              status:
                nextStatus,

              changedBy:
                req.employee!
                  .employeeId,
            },
          });

          return updatedOrder;
        }
      );

    /* =====================================================
       QR FINAL BILLING
       -----------------------------------------------------
       A QR/self-service order is NEVER billed automatically
       when it reaches COMPLETED.

       Customers can place multiple orders during the same
       open table session. Those orders remain unbilled until
       the customer explicitly requests the final bill.

       The final-bill endpoint is responsible for collecting
       all eligible orders in the same TableSession into ONE
       Bill.
    ===================================================== */

    /* =====================================================
       AUDIT
    ===================================================== */

    await logAudit({
      userId:
        req.employee!.employeeId,

      action:
        'UPDATE_ORDER_STATUS',

      entity:
        'Order',

      entityId:
        order.id,

      metadata: {
        previousStatus:
          order.status,

        newStatus:
          nextStatus,
      },
    });

    /* =====================================================
       REAL-TIME EVENTS
    ===================================================== */

    const io =
      getIO();

    if (io) {
      io
        .to(
          `branch:${order.branchId}:kitchen`
        )
        .emit(
          `order.${nextStatus.toLowerCase()}`,
          updated
        );

      io
        .to(
          `branch:${order.branchId}:service`
        )
        .emit(
          `order.${nextStatus.toLowerCase()}`,
          updated
        );

      if (
        order.customerId
      ) {
        io
          .to(
            `customer:${order.customerId}`
          )
          .emit(
            `order.${nextStatus.toLowerCase()}`,
            updated
          );
      }

      io
        .to(`qr-order:${order.id}`)
        .emit(
          `order.${nextStatus.toLowerCase()}`,
          updated
        );

    }

    /* =====================================================
       NOTIFY SERVICE EMPLOYEE
    ===================================================== */

    if (
      nextStatus === 'READY' &&
      order.serviceEmployeeId
    ) {
      const tableNumber =
        order.tableSession
          ?.table
          ?.number;

      await notify({
        userId:
          order.serviceEmployeeId,

        userType:
          'EMPLOYEE',

        type:
          'ORDER_READY',

        title:
          `Order #${order.orderNumber} is ready`,

        message:
          tableNumber
            ? `Please serve Table ${tableNumber}.`
            : 'The takeaway order is ready.',

        relatedEntity:
          order.id,
      });
    }

    res.json({
      order: updated,
    });
  })
);

/* =========================================================
   GET SINGLE ORDER
========================================================= */

router.get(
  '/:id',

  optionalAuth,

  asyncHandler(async (req, res) => {
    const order =
      await prisma.order.findUnique({
        where: {
          id: req.params.id,
        },

        include: {
          items: true,

          statusHistory: true,

          tableSession: {
            include: {
              table: true,
            },
          },

          coupon: true,
        },
      });

    if (!order) {
      throw new NotFoundError(
        'Order not found.'
      );
    }

    /* =====================================================
       CUSTOMER SECURITY
    ===================================================== */

    if (
      req.customer &&
      order.customerId !==
        req.customer.customerId
    ) {
      throw new ForbiddenError();
    }

    /* =====================================================
       EMPLOYEE SECURITY
    ===================================================== */

    if (
      req.employee &&
      req.employee.role !==
        'SUPER_ADMIN' &&
      req.employee.branchId !==
        order.branchId
    ) {
      throw new ForbiddenError(
        'You do not have access to this order.'
      );
    }

    res.json({
      order,
    });
  })
);

/* =========================================================
   LIST ORDERS
========================================================= */

router.get(
  '/',

  requireEmployeeAuth,

  requireRole(
    'MANAGER',
    'SUPER_ADMIN',
    'BILLING_EMPLOYEE',
    'SERVICE_EMPLOYEE'
  ),

  asyncHandler(async (req, res) => {
    let branchId: string | undefined;

    if (
      req.employee!.role ===
      'SUPER_ADMIN'
    ) {
      if (
        req.query.branchId
      ) {
        branchId =
          z
            .string()
            .uuid()
            .parse(
              req.query.branchId
            );
      }
    } else {
      branchId =
        req.employee!.branchId ??
        undefined;
    }

    const orders =
      await prisma.order.findMany({
        where: branchId
          ? {
              branchId,
            }
          : {},

        include: {
          items: true,

          tableSession: {
            include: {
              table: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },

        take: 200,
      });

    res.json({
      orders,
    });
  })
);

export default router;
