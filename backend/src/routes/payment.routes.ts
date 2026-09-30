import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors';
import { logAudit } from '../services/audit.service';
import { getIO } from '../sockets';

const router = Router();

const recordSchema = z.object({
  billId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'UPI', 'CARD', 'OTHER']),
});

function assertBranchAccess(
  employee: {
    employeeId: string;
    role: string;
    branchId?: string | null;
  },
  branchId: string
) {
  if (employee.role === 'SUPER_ADMIN') {
    return;
  }

  if (!employee.branchId || employee.branchId !== branchId) {
    throw new ForbiddenError();
  }
}

/**
 * POST /api/payments/record
 *
 * Staff records a payment collected in person.
 *
 * Customer online payment is intentionally NOT supported.
 */
router.post(
  '/record',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER', 'BILLING_EMPLOYEE'),
  asyncHandler(async (req, res) => {
    const { billId, amount, method } = recordSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.bill.findUnique({
        where: {
          id: billId,
        },
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
                  branchId: true,
                },
              },
            },
          },
        },
      });

      if (!bill) {
        throw new NotFoundError('Bill not found.');
      }

      /*
       * Determine the branch that owns this bill.
       *
       * Dine-in:
       * Bill -> TableSession -> Table -> Branch
       *
       * Takeaway:
       * Bill -> BillItem -> Order -> Branch
       */
      const branchId =
        bill.tableSession?.table.branchId ??
        bill.items[0]?.order.branchId;

      if (!branchId) {
        throw new AppError(
          'Unable to determine the branch for this bill.',
          500
        );
      }

      assertBranchAccess(req.employee!, branchId);

      if (bill.paymentStatus === 'REFUNDED') {
        throw new AppError(
          'This bill has already been refunded.',
          400
        );
      }

      if (bill.paymentStatus === 'PAID') {
        throw new AppError(
          'This bill has already been paid.',
          400
        );
      }

      /*
       * Calculate payments already recorded.
       */
      const alreadyPaid = bill.payments.reduce(
        (sum, payment) => sum.add(payment.amount),
        new Prisma.Decimal(0)
      );

      const billTotal = bill.total;

      const remainingAmount = billTotal.sub(alreadyPaid);

      if (remainingAmount.lessThanOrEqualTo(0)) {
        throw new AppError(
          'This bill has no remaining balance.',
          400
        );
      }

      const paymentAmount = new Prisma.Decimal(amount);

      /*
       * Prevent overpayment.
       */
      if (paymentAmount.greaterThan(remainingAmount)) {
        throw new AppError(
          `Payment exceeds the remaining balance of ${remainingAmount.toFixed(
            2
          )}.`,
          400
        );
      }

      const newTotalPaid = alreadyPaid.add(paymentAmount);

      /*
       * Determine the new payment status.
       */
      let newStatus:
        | 'UNPAID'
        | 'PARTIALLY_PAID'
        | 'PAID';

      if (newTotalPaid.equals(new Prisma.Decimal(0))) {
        newStatus = 'UNPAID';
      } else if (newTotalPaid.greaterThanOrEqualTo(billTotal)) {
        newStatus = 'PAID';
      } else {
        newStatus = 'PARTIALLY_PAID';
      }

      /*
       * Create the payment.
       */
      const payment = await tx.payment.create({
        data: {
          billId: bill.id,
          amount: paymentAmount,
          method,
          recordedById: req.employee!.employeeId,
        },
      });

      /*
       * Update the bill status.
       */
      const updatedBill = await tx.bill.update({
        where: {
          id: bill.id,
        },
        data: {
          paymentStatus: newStatus,
        },
      });

      /*
       * When the bill is completely paid:
       *
       * PAID
       *   ↓
       * Table Session CLOSED
       *   ↓
       * Restaurant Table AVAILABLE
       *
       * This applies only to dine-in bills.
       */
      if (newStatus === 'PAID' && bill.tableSession) {
        /*
         * IMPORTANT:
         * tableSessionId is nullable in Prisma.
         *
         * The `bill.tableSession` check above guarantees that
         * the relationship exists, but TypeScript still sees
         * tableSessionId as possibly null.
         *
         * The `!` tells TypeScript it is definitely present here.
         */
        await tx.tableSession.update({
          where: {
            id: bill.tableSessionId!,
          },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
          },
        });

        /*
         * Make the restaurant table available again.
         */
        await tx.restaurantTable.update({
          where: {
            id: bill.tableSession.tableId,
          },
          data: {
            status: 'AVAILABLE',
          },
        });
      }

      return {
        payment,
        bill: updatedBill,
        branchId,
        alreadyPaid,
        newTotalPaid,
      };
    });

    /*
     * Write audit log only after the transaction succeeds.
     */
    await logAudit({
      userId: req.employee!.employeeId,
      action: 'RECORD_PAYMENT',
      entity: 'Payment',
      entityId: result.payment.id,
      metadata: {
        billId,
        amount,
        method,
        billStatus: result.bill.paymentStatus,
      },
    });

    /*
     * Notify connected staff/client applications.
     */
    const io = getIO();

    if (io) {
      io.emit('payment.recorded', {
        billId,
        paymentId: result.payment.id,
        amount,
        method,
        status: result.bill.paymentStatus,
      });
    }

    /*
     * Calculate remaining balance for the response.
     */
    const remainingAmount = result.bill.total.sub(
      result.newTotalPaid
    );

    res.status(201).json({
      payment: result.payment,
      billStatus: result.bill.paymentStatus,
      billTotal: result.bill.total,
      totalPaid: result.newTotalPaid,
      remainingAmount,
    });
  })
);

/**
 * GET /api/payments
 *
 * Returns payments visible to the logged-in employee.
 *
 * SUPER_ADMIN:
 *   All branches.
 *
 * MANAGER / BILLING_EMPLOYEE:
 *   Their assigned branch only.
 */
router.get(
  '/',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER', 'BILLING_EMPLOYEE'),
  asyncHandler(async (req, res) => {
    const payments = await prisma.payment.findMany({
      orderBy: {
        recordedAt: 'desc',
      },

      take: 200,

      include: {
        bill: {
          include: {
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
                    branchId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    /*
     * SUPER_ADMIN can see every branch.
     */
    if (req.employee!.role === 'SUPER_ADMIN') {
      return res.json({
        payments,
      });
    }

    /*
     * Other employees must have a branch.
     */
    const employeeBranchId = req.employee!.branchId;

    if (!employeeBranchId) {
      throw new ForbiddenError();
    }

    /*
     * Filter payments to the employee's branch.
     */
    const branchPayments = payments.filter((payment) => {
      const paymentBranchId =
        payment.bill.tableSession?.table.branchId ??
        payment.bill.items[0]?.order.branchId;

      return paymentBranchId === employeeBranchId;
    });

    res.json({
      payments: branchPayments,
    });
  })
);

export default router;