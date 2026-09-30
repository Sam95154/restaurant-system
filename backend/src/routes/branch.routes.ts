import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth } from '../middleware/auth';
import { requireRole, requireBranchAccess } from '../middleware/rbac';
import { logAudit } from '../services/audit.service';
import { NotFoundError } from '../utils/errors';

const router = Router();

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

const branchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  country: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(30),
  email: z.string().trim().email().max(150),
  openingTime: z.string().trim().min(1).max(20),
  closingTime: z.string().trim().min(1).max(20),
  weeklyHoliday: z.string().trim().max(50).optional(),
});

const statusSchema = z.object({
  status: z.enum([
    'OPENING_SOON',
    'OPEN',
    'CLOSED',
    'TEMPORARILY_CLOSED',
    'PERMANENTLY_CLOSED',
  ]),
});

const assignManagerSchema = z.object({
  managerId: z.string().uuid(),
});

/**
 * ============================================================
 * PUBLIC BRANCH LIST
 * ============================================================
 *
 * Used by the customer-facing branch picker.
 */

router.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const branches = await prisma.branch.findMany({
      where: {
        status: {
          in: ['OPEN', 'TEMPORARILY_CLOSED'],
        },
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        country: true,
        phone: true,
        email: true,
        logoUrl: true,
        status: true,
        openingTime: true,
        closingTime: true,
        weeklyHoliday: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json({ branches });
  }),
);

/**
 * ============================================================
 * LIST ALL BRANCHES
 * ============================================================
 *
 * SUPER_ADMIN only.
 */

router.get(
  '/',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    const branches = await prisma.branch.findMany({
      include: {
        manager: true,
        employees: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            loginId: true,
            role: true,
            department: true,
            status: true,
            joiningDate: true,
          },
          orderBy: {
            fullName: 'asc',
          },
        },
        _count: {
          select: {
            employees: true,
            categories: true,
            items: true,
            tables: true,
            orders: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json({ branches });
  }),
);

/**
 * ============================================================
 * CREATE BRANCH
 * ============================================================
 *
 * SUPER_ADMIN only.
 */

router.post(
  '/',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const data = branchSchema.parse(req.body);

    const existingBranch = await prisma.branch.findFirst({
      where: {
        name: {
          equals: data.name,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
      },
    });

    if (existingBranch) {
      return res.status(409).json({
        message: 'A branch with this name already exists.',
      });
    }

    const branch = await prisma.branch.create({
      data,
      include: {
        manager: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      userRole: 'SUPER_ADMIN',
      action: 'CREATE_BRANCH',
      entity: 'Branch',
      entityId: branch.id,
      metadata: {
        name: branch.name,
        status: branch.status,
      },
    });

    res.status(201).json({ branch });
  }),
);

/**
 * ============================================================
 * GET SINGLE BRANCH
 * ============================================================
 *
 * SUPER_ADMIN can view any branch.
 * Branch managers can view their own branch through
 * requireBranchAccess.
 */

router.get(
  '/:id',
  requireEmployeeAuth,
  requireBranchAccess((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const branch = await prisma.branch.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        manager: true,
        employees: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            loginId: true,
            role: true,
            department: true,
            status: true,
            joiningDate: true,
          },
          orderBy: {
            fullName: 'asc',
          },
        },
        _count: {
          select: {
            employees: true,
            categories: true,
            items: true,
            tables: true,
            orders: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundError('Branch not found.');
    }

    res.json({ branch });
  }),
);

/**
 * ============================================================
 * UPDATE BRANCH
 * ============================================================
 *
 * SUPER_ADMIN only.
 */

router.put(
  '/:id',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const data = branchSchema.partial().parse(req.body);

    const branch = await prisma.branch.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!branch) {
      throw new NotFoundError('Branch not found.');
    }

    if (data.name && data.name.toLowerCase() !== branch.name.toLowerCase()) {
      const duplicate = await prisma.branch.findFirst({
        where: {
          name: {
            equals: data.name,
            mode: 'insensitive',
          },
          NOT: {
            id: branch.id,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        return res.status(409).json({
          message: 'A branch with this name already exists.',
        });
      }
    }

    const updatedBranch = await prisma.branch.update({
      where: {
        id: req.params.id,
      },
      data,
      include: {
        manager: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'UPDATE_BRANCH',
      entity: 'Branch',
      entityId: updatedBranch.id,
      metadata: {
        changedFields: Object.keys(data),
      },
    });

    res.json({
      branch: updatedBranch,
    });
  }),
);

/**
 * ============================================================
 * UPDATE BRANCH STATUS
 * ============================================================
 *
 * SUPER_ADMIN only.
 *
 * We intentionally do NOT delete branches.
 * Historical orders, bills, payments and audit records
 * must remain available.
 */

router.patch(
  '/:id/status',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body);

    const existingBranch = await prisma.branch.findUnique({
      where: {
        id: req.params.id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existingBranch) {
      throw new NotFoundError('Branch not found.');
    }

    const branch = await prisma.branch.update({
      where: {
        id: req.params.id,
      },
      data: {
        status,
      },
      include: {
        manager: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'UPDATE_BRANCH_STATUS',
      entity: 'Branch',
      entityId: branch.id,
      metadata: {
        oldStatus: existingBranch.status,
        newStatus: status,
      },
    });

    res.json({ branch });
  }),
);

/**
 * ============================================================
 * ASSIGN / CHANGE BRANCH MANAGER
 * ============================================================
 *
 * SUPER_ADMIN only.
 */

router.post(
  '/:id/assign-manager',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { managerId } = assignManagerSchema.parse(req.body);

    const branch = await prisma.branch.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!branch) {
      throw new NotFoundError('Branch not found.');
    }

    const manager = await prisma.employee.findUnique({
      where: {
        id: managerId,
      },
    });

    if (!manager) {
      throw new NotFoundError('Employee not found.');
    }

    if (manager.status !== 'ACTIVE') {
      return res.status(400).json({
        message: 'Only an active employee can be assigned as branch manager.',
      });
    }

    /**
     * If this employee manages another branch,
     * prevent one employee from managing multiple branches.
     */
    const existingManagedBranch = await prisma.branch.findFirst({
      where: {
        managerId,
        NOT: {
          id: branch.id,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (existingManagedBranch) {
      return res.status(409).json({
        message: `This employee is already the manager of ${existingManagedBranch.name}.`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      /**
       * If the branch already has another manager,
       * keep that employee as MANAGER unless another
       * business rule is added later. The new manager
       * simply becomes the branch manager.
       */

      const updatedManager = await tx.employee.update({
        where: {
          id: managerId,
        },
        data: {
          role: 'MANAGER',
          branchId: branch.id,
        },
      });

      const updatedBranch = await tx.branch.update({
        where: {
          id: branch.id,
        },
        data: {
          managerId: managerId,
        },
        include: {
          manager: true,
        },
      });

      return {
        branch: updatedBranch,
        manager: updatedManager,
      };
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'ASSIGN_MANAGER',
      entity: 'Branch',
      entityId: branch.id,
      metadata: {
        managerId,
      },
    });

    res.json(result);
  }),
);

export default router;