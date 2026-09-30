import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import {
  requireEmployeeAuth,
  optionalAuth,
} from '../middleware/auth';
import { requireBranchAccess, requireRole } from '../middleware/rbac';
import { logAudit } from '../services/audit.service';

const router = Router();

/* =========================================================
   VALIDATION
========================================================= */

const uuidSchema = z.string().uuid();

const categoryCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Category name is required.')
    .max(100, 'Category name is too long.'),

  description: z
    .string()
    .trim()
    .max(500, 'Description is too long.')
    .optional(),

  image: z
    .string()
    .url('Image must be a valid URL.')
    .optional()
    .nullable(),

  branchId: uuidSchema,
});

const categoryUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Category name is required.')
    .max(100, 'Category name is too long.')
    .optional(),

  description: z
    .string()
    .trim()
    .max(500, 'Description is too long.')
    .optional()
    .nullable(),

  image: z
    .string()
    .url('Image must be a valid URL.')
    .optional()
    .nullable(),
});

/* =========================================================
   PUBLIC - CUSTOMER CATEGORY LIST
========================================================= */

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const branchId = uuidSchema.parse(req.query.branchId);

    const branch = await prisma.branch.findUnique({
      where: {
        id: branchId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!branch) {
      return res.status(404).json({
        error: 'Branch not found.',
      });
    }

    /*
     * Customers should only see menus for branches that
     * are currently available for ordering.
     */
    if (
      branch.status !== 'OPEN' &&
      branch.status !== 'TEMPORARILY_CLOSED'
    ) {
      return res.status(400).json({
        error: 'Menu is not currently available for this branch.',
      });
    }

    const categories = await prisma.category.findMany({
      where: {
        branchId,
        status: 'ACTIVE',
      },
      orderBy: {
        name: 'asc',
      },
      select: {
  id: true,
  name: true,
  description: true,
  image: true,
  status: true,
  branchId: true,
},
    });

    return res.json({
      categories,
    });
  }),
);

/* =========================================================
   CREATE CATEGORY
========================================================= */

router.post(
  '/',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  requireBranchAccess((req) => {
    return req.body?.branchId;
  }),
  asyncHandler(async (req, res) => {
    const data = categoryCreateSchema.parse(req.body);

    const branch = await prisma.branch.findUnique({
      where: {
        id: data.branchId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!branch) {
      return res.status(404).json({
        error: 'Branch not found.',
      });
    }

    /*
     * Prevent duplicate category names inside the same branch.
     * Case-insensitive comparison is handled here so:
     * "Biryani" and "biryani" cannot both exist.
     */
    const existing = await prisma.category.findFirst({
      where: {
        branchId: data.branchId,
        name: {
          equals: data.name,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return res.status(409).json({
        error: 'A category with this name already exists in this branch.',
      });
    }

    const category = await prisma.category.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        image: data.image ?? null,
        branchId: data.branchId,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'CREATE_CATEGORY',
      entity: 'Category',
      entityId: category.id,
    });

    return res.status(201).json({
      category,
    });
  }),
);

/* =========================================================
   UPDATE CATEGORY
========================================================= */

router.put(
  '/:id',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const categoryId = uuidSchema.parse(req.params.id);
    const data = categoryUpdateSchema.parse(req.body);

    const existing = await prisma.category.findUnique({
      where: {
        id: categoryId,
      },
      select: {
        id: true,
        name: true,
        branchId: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Category not found.',
      });
    }

    /*
     * Branch security is based on the category's actual
     * database branch, not a branchId supplied by the frontend.
     */
    if (req.employee!.role !== 'SUPER_ADMIN') {
      if (req.employee!.branchId !== existing.branchId) {
        return res.status(403).json({
          error: 'You do not have access to this branch.',
        });
      }
    }

    if (data.name) {
      const duplicate = await prisma.category.findFirst({
        where: {
          branchId: existing.branchId,
          id: {
            not: existing.id,
          },
          name: {
            equals: data.name,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        return res.status(409).json({
          error:
            'A category with this name already exists in this branch.',
        });
      }
    }

    const category = await prisma.category.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(data.name !== undefined
          ? { name: data.name }
          : {}),

        ...(data.description !== undefined
          ? { description: data.description }
          : {}),

        ...(data.image !== undefined
          ? { image: data.image }
          : {}),
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'UPDATE_CATEGORY',
      entity: 'Category',
      entityId: category.id,
    });

    return res.json({
      category,
    });
  }),
);

/* =========================================================
   ACTIVATE / DEACTIVATE CATEGORY
========================================================= */

router.patch(
  '/:id/status',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const categoryId = uuidSchema.parse(req.params.id);

    const status = z
      .enum(['ACTIVE', 'INACTIVE'])
      .parse(req.body?.status);

    const existing = await prisma.category.findUnique({
      where: {
        id: categoryId,
      },
      select: {
        id: true,
        branchId: true,
        status: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Category not found.',
      });
    }

    if (req.employee!.role !== 'SUPER_ADMIN') {
      if (req.employee!.branchId !== existing.branchId) {
        return res.status(403).json({
          error: 'You do not have access to this branch.',
        });
      }
    }

    if (existing.status === status) {
      return res.json({
        category: existing,
        message: `Category is already ${status.toLowerCase()}.`,
      });
    }

    const category = await prisma.category.update({
      where: {
        id: categoryId,
      },
      data: {
        status,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action:
        status === 'ACTIVE'
          ? 'ACTIVATE_CATEGORY'
          : 'DEACTIVATE_CATEGORY',
      entity: 'Category',
      entityId: category.id,
    });

    return res.json({
      category,
    });
  }),
);

export default router;