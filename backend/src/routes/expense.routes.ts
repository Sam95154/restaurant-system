import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { requireEmployeeAuth } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import { expenseReceiptUpload } from '../middleware/expenseReceiptUpload';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'MANAGER'] as const;

function requireManagementAccess(req: any) {
  if (!req.employee) {
    throw new AppError('Login required.', 401);
  }

  if (!MANAGEMENT_ROLES.includes(req.employee.role)) {
    throw new AppError(
      'You do not have permission to manage expenses.',
      403,
    );
  }
}

function assertBranchAccess(req: any, branchId: string) {
  if (req.employee.role === 'SUPER_ADMIN') {
    return;
  }

  if (
    req.employee.role === 'MANAGER' &&
    req.employee.branchId === branchId
  ) {
    return;
  }

  throw new AppError(
    'You do not have access to this branch.',
    403,
  );
}

const createExpenseSchema = z.object({
  branchId: z.string().uuid(),
  category: z.string().trim().min(1).max(100),
  amount: z.coerce.number().positive(),
  expenseDate: z.coerce.date(),
  paymentMethod: z.enum([
    'CASH',
    'UPI',
    'CARD',
    'OTHER',
  ]),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable(),
  receiptUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable(),
});

const updateExpenseSchema = createExpenseSchema
  .omit({ branchId: true })
  .partial();

const listExpenseSchema = z.object({
  branchId: z.string().uuid().optional(),
  category: z.string().trim().optional(),
  paymentMethod: z
    .enum(['CASH', 'UPI', 'CARD', 'OTHER'])
    .optional(),
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Create expense
router.post(
  '/',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    requireManagementAccess(req);

    const data = createExpenseSchema.parse(req.body);

    assertBranchAccess(req, data.branchId);

    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
      select: { id: true, name: true },
    });

    if (!branch) {
      throw new AppError('Branch not found.', 404);
    }

    const expense = await prisma.expense.create({
      data: {
        branchId: data.branchId,
        createdById: req.employee!.employeeId,
        category: data.category,
        amount: data.amount,
        expenseDate: data.expenseDate,
        paymentMethod: data.paymentMethod,
        description: data.description ?? null,
        receiptUrl: data.receiptUrl ?? null,
        status: 'ACTIVE',
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      userRole: req.employee!.role,
      action: 'CREATE_EXPENSE',
      entity: 'Expense',
      entityId: expense.id,
      metadata: {
        branchId: expense.branchId,
        category: expense.category,
        amount: expense.amount.toString(),
        paymentMethod: expense.paymentMethod,
      },
    });

    res.status(201).json({
      message: 'Expense created successfully.',
      expense,
    });
  }),
);

// List expenses
router.get(
  '/',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    requireManagementAccess(req);

    const filters = listExpenseSchema.parse(req.query);

    let branchId: string | null | undefined = filters.branchId;

    if (req.employee!.role === 'MANAGER') {
      branchId = req.employee!.branchId;

      if (
        filters.branchId &&
        filters.branchId !== req.employee!.branchId
      ) {
        throw new AppError(
          'You do not have access to this branch.',
          403,
        );
      }
    }

    const where: any = {};

    if (branchId) {
      where.branchId = branchId;
    }

    if (filters.category) {
      where.category = {
        contains: filters.category,
        mode: 'insensitive',
      };
    }

    if (filters.paymentMethod) {
      where.paymentMethod = filters.paymentMethod;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.fromDate || filters.toDate) {
      where.expenseDate = {};

      if (filters.fromDate) {
        where.expenseDate.gte = filters.fromDate;
      }

      if (filters.toDate) {
        where.expenseDate.lte = filters.toDate;
      }
    }

    const skip = (filters.page - 1) * filters.limit;

    const [expenses, total, summary] =
      await prisma.$transaction([
        prisma.expense.findMany({
          where,
          orderBy: [
            { expenseDate: 'desc' },
            { createdAt: 'desc' },
          ],
          skip,
          take: filters.limit,
          include: {
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                fullName: true,
                role: true,
              },
            },
          },
        }),
        prisma.expense.count({ where }),
        prisma.expense.aggregate({
          where: {
            ...where,
            status: 'ACTIVE',
          },
          _sum: {
            amount: true,
          },
          _count: {
            _all: true,
          },
        }),
      ]);

    res.json({
      expenses,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
      summary: {
        activeExpenseCount: summary._count._all,
        activeExpenseTotal:
          summary._sum.amount?.toString() ?? '0.00',
      },
    });
  }),
);

// Get one expense
router.get(
  '/:id',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    requireManagementAccess(req);

    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    if (!expense) {
      throw new AppError('Expense not found.', 404);
    }

    assertBranchAccess(req, expense.branchId);

    res.json({ expense });
  }),
);

// Update expense
router.patch(
  '/:id',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    requireManagementAccess(req);

    const data = updateExpenseSchema.parse(req.body);

    const existing = await prisma.expense.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new AppError('Expense not found.', 404);
    }

    assertBranchAccess(req, existing.branchId);

    if (existing.status === 'CANCELLED') {
      throw new AppError(
        'Cancelled expenses cannot be edited.',
        400,
      );
    }

    const expense = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        ...(data.category !== undefined && {
          category: data.category,
        }),
        ...(data.amount !== undefined && {
          amount: data.amount,
        }),
        ...(data.expenseDate !== undefined && {
          expenseDate: data.expenseDate,
        }),
        ...(data.paymentMethod !== undefined && {
          paymentMethod: data.paymentMethod,
        }),
        ...(data.description !== undefined && {
          description: data.description ?? null,
        }),
        ...(data.receiptUrl !== undefined && {
          receiptUrl: data.receiptUrl ?? null,
        }),
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      userRole: req.employee!.role,
      action: 'UPDATE_EXPENSE',
      entity: 'Expense',
      entityId: expense.id,
      metadata: {
        branchId: expense.branchId,
        previousAmount: existing.amount.toString(),
        newAmount: expense.amount.toString(),
        category: expense.category,
      },
    });

    res.json({
      message: 'Expense updated successfully.',
      expense,
    });
  }),
);

// Cancel expense
router.post(
  '/:id/cancel',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    requireManagementAccess(req);

    const existing = await prisma.expense.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new AppError('Expense not found.', 404);
    }

    assertBranchAccess(req, existing.branchId);

    if (existing.status === 'CANCELLED') {
      throw new AppError(
        'Expense is already cancelled.',
        400,
      );
    }

    const expense = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        status: 'CANCELLED',
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      userRole: req.employee!.role,
      action: 'CANCEL_EXPENSE',
      entity: 'Expense',
      entityId: expense.id,
      metadata: {
        branchId: expense.branchId,
        amount: expense.amount.toString(),
        category: expense.category,
      },
    });

    res.json({
      message: 'Expense cancelled successfully.',
      expense,
    });
  }),
);

// Upload / replace expense receipt
router.post(
  '/:id/receipt',
  requireEmployeeAuth,
  expenseReceiptUpload.single('receipt'),
  asyncHandler(async (req, res) => {
    requireManagementAccess(req);

    const expenseId = req.params.id;

    const existing = await prisma.expense.findUnique({
      where: { id: expenseId },
    });

    if (!existing) {
      // If Multer already saved a file, remove it because
      // the requested expense does not exist.
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch {
          // Ignore cleanup errors.
        }
      }

      throw new AppError(
        'Expense not found.',
        404,
      );
    }

    assertBranchAccess(
      req,
      existing.branchId,
    );

    if (existing.status === 'CANCELLED') {
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch {
          // Ignore cleanup errors.
        }
      }

      throw new AppError(
        'Cancelled expenses cannot receive a receipt.',
        400,
      );
    }

    if (!req.file) {
      throw new AppError(
        'Please select a receipt file.',
        400,
      );
    }

    /*
     * Store only the public file reference in PostgreSQL.
     * The physical file remains inside:
     *
     * backend/uploads/expenses/
     */
    const receiptUrl =
      `/uploads/expenses/${path.basename(
        req.file.filename,
      )}`;

    /*
     * Update the database only after the file has
     * successfully been written by Multer.
     */
    const expense = await prisma.expense.update({
      where: { id: existing.id },

      data: {
        receiptUrl,
      },

      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },

        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    /*
     * If there was an older receipt, remove it from disk
     * after the new database reference has been saved.
     */
    if (
      existing.receiptUrl &&
      existing.receiptUrl.startsWith(
        '/uploads/expenses/',
      )
    ) {
      const oldFileName = path.basename(
        existing.receiptUrl,
      );

      const oldFilePath = path.join(
        process.cwd(),
        'uploads',
        'expenses',
        oldFileName,
      );

      try {
        await fs.unlink(oldFilePath);
      } catch {
        // The old file may already be missing.
      }
    }

    await logAudit({
      userId: req.employee!.employeeId,
      userRole: req.employee!.role,
      action: existing.receiptUrl
        ? 'REPLACE_EXPENSE_RECEIPT'
        : 'UPLOAD_EXPENSE_RECEIPT',
      entity: 'Expense',
      entityId: expense.id,
      metadata: {
        branchId: expense.branchId,
        fileName: req.file.originalname,
        storedFileName: req.file.filename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      },
    });

    res.json({
      message: existing.receiptUrl
        ? 'Expense receipt replaced successfully.'
        : 'Expense receipt uploaded successfully.',
      expense,
    });
  }),
);
export default router;


