import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { requireEmployeeAuth } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import { restaurantLogoUpload } from '../middleware/restaurantLogoUpload';
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
      'You do not have permission to manage settings.',
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

const settingsSchema = z.object({
  taxEnabled: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  receiptFooter: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable(),
  billPrefix: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable(),
  qrOrderingEnabled: z.boolean().optional(),
});

const branchInfoSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500),
  city: z.string().trim().max(100),
  state: z.string().trim().max(100),
  country: z.string().trim().max(100),
  phone: z.string().trim().max(50),
  email: z
    .string()
    .trim()
    .email()
    .or(z.literal('')),
  openingTime: z.string().trim().max(20),
  closingTime: z.string().trim().max(20),
  weeklyHoliday: z
    .string()
    .trim()
    .max(50)
    .optional()
    .nullable(),
});

/**
 * GET /api/settings/:branchId
 *
 * Load branch information and restaurant settings.
 *
 * SUPER_ADMIN:
 *   Can access any branch.
 *
 * MANAGER:
 *   Can access only their own branch.
 */
router.get(
  '/:branchId',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    requireManagementAccess(req);

    const { branchId } = req.params;

    assertBranchAccess(req, branchId);

    const branch = await prisma.branch.findUnique({
      where: {
        id: branchId,
      },
      include: {
        settings: true,
      },
    });

    if (!branch) {
      throw new AppError('Branch not found.', 404);
    }

    res.json({
      branch: {
        id: branch.id,
        name: branch.name,
        address: branch.address,
        city: branch.city,
        state: branch.state,
        country: branch.country,
        phone: branch.phone,
        email: branch.email,
        openingTime: branch.openingTime,
        closingTime: branch.closingTime,
        weeklyHoliday: branch.weeklyHoliday,
        status: branch.status,
        logoUrl: branch.logoUrl,
      },

      settings: branch.settings ?? {
        id: null,
        branchId: branch.id,
        taxEnabled: true,
        taxRate: '0',
        currency: 'INR',
        receiptFooter: null,
        billPrefix: null,
        qrOrderingEnabled: true,
      },
    });
  }),
);

/**
 * PUT /api/settings/:branchId
 *
 * Update restaurant settings.
 */
router.put(
  '/:branchId',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    requireManagementAccess(req);

    const { branchId } = req.params;

    assertBranchAccess(req, branchId);

    const data = settingsSchema.parse(req.body);

    const branch = await prisma.branch.findUnique({
      where: {
        id: branchId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!branch) {
      throw new AppError('Branch not found.', 404);
    }

    const settings = await prisma.restaurantSettings.upsert({
      where: {
        branchId,
      },

      create: {
        branchId,
        taxEnabled: data.taxEnabled ?? true,
        taxRate: data.taxRate ?? 0,
        currency: data.currency ?? 'INR',
        receiptFooter: data.receiptFooter ?? null,
        billPrefix: data.billPrefix ?? null,
        qrOrderingEnabled: data.qrOrderingEnabled ?? true,
      },

      update: {
        ...(data.taxEnabled !== undefined && {
          taxEnabled: data.taxEnabled,
        }),

        ...(data.taxRate !== undefined && {
          taxRate: data.taxRate,
        }),

        ...(data.currency !== undefined && {
          currency: data.currency,
        }),

        ...(data.receiptFooter !== undefined && {
          receiptFooter: data.receiptFooter ?? null,
        }),

        ...(data.billPrefix !== undefined && {
          billPrefix: data.billPrefix ?? null,
        }),

        ...(data.qrOrderingEnabled !== undefined && {
          qrOrderingEnabled: data.qrOrderingEnabled,
        }),
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      userRole: req.employee!.role,
      action: 'UPDATE_SETTINGS',
      entity: 'RestaurantSettings',
      entityId: settings.id,
      metadata: {
        branchId,
        updatedFields: Object.keys(data),
      },
    });

    res.json({
      message: 'Settings updated successfully.',
      settings,
    });
  }),
);

/**
 * PUT /api/settings/:branchId/branch
 *
 * Update restaurant / branch information.
 */
router.put(
  '/:branchId/branch',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    requireManagementAccess(req);

    const { branchId } = req.params;

    assertBranchAccess(req, branchId);

    const data = branchInfoSchema.parse(req.body);

    const existingBranch = await prisma.branch.findUnique({
      where: {
        id: branchId,
      },
    });

    if (!existingBranch) {
      throw new AppError('Branch not found.', 404);
    }

    const branch = await prisma.branch.update({
      where: {
        id: branchId,
      },

      data: {
        name: data.name,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        phone: data.phone,
        email: data.email,
        openingTime: data.openingTime,
        closingTime: data.closingTime,
        weeklyHoliday: data.weeklyHoliday ?? null,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      userRole: req.employee!.role,
      action: 'UPDATE_BRANCH_SETTINGS',
      entity: 'Branch',
      entityId: branch.id,
      metadata: {
        branchId,
        updatedFields: Object.keys(data),
      },
    });

    res.json({
      message: 'Branch information updated successfully.',
      branch,
    });
  }),
);
/**
 * POST /api/settings/:branchId/logo
 *
 * Upload or replace restaurant logo.
 *
 * Only SUPER_ADMIN can change restaurant logos.
 */
router.post(
  '/:branchId/logo',
  requireEmployeeAuth,
  restaurantLogoUpload.single('logo'),
  asyncHandler(async (req, res) => {
    if (!req.employee) {
      throw new AppError('Login required.', 401);
    }

    if (req.employee.role !== 'SUPER_ADMIN') {
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch {
          // Ignore cleanup errors.
        }
      }

      throw new AppError(
        'Only Super Admin can change the restaurant logo.',
        403,
      );
    }

    const { branchId } = req.params;

    const branch = await prisma.branch.findUnique({
      where: {
        id: branchId,
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
    });

    if (!branch) {
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch {
          // Ignore cleanup errors.
        }
      }

      throw new AppError('Branch not found.', 404);
    }

    if (!req.file) {
      throw new AppError(
        'Please select a logo image.',
        400,
      );
    }

    const logoUrl =
      `/uploads/restaurant-logo/${path.basename(
        req.file.filename,
      )}`;

    const updatedBranch = await prisma.branch.update({
      where: {
        id: branch.id,
      },
      data: {
        logoUrl,
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
    });

    // Delete the previous logo only after the
    // database has successfully stored the new one.
    if (
      branch.logoUrl &&
      branch.logoUrl.startsWith(
        '/uploads/restaurant-logo/',
      )
    ) {
      const oldFileName = path.basename(
        branch.logoUrl,
      );

      const oldFilePath = path.join(
        process.cwd(),
        'uploads',
        'restaurant-logo',
        oldFileName,
      );

      try {
        await fs.unlink(oldFilePath);
      } catch {
        // The old file may already be missing.
      }
    }

    await logAudit({
      userId: req.employee.employeeId,
      userRole: req.employee.role,
      action: branch.logoUrl
        ? 'REPLACE_RESTAURANT_LOGO'
        : 'UPLOAD_RESTAURANT_LOGO',
      entity: 'Branch',
      entityId: branch.id,
      metadata: {
        branchId: branch.id,
        branchName: branch.name,
        originalFileName: req.file.originalname,
        storedFileName: req.file.filename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      },
    });

    res.json({
      message: branch.logoUrl
        ? 'Restaurant logo replaced successfully.'
        : 'Restaurant logo uploaded successfully.',
      branch: updatedBranch,
    });
  }),
);

/**
 * DELETE /api/settings/:branchId/logo
 *
 * Delete restaurant logo.
 *
 * Only SUPER_ADMIN can delete the logo.
 */
router.delete(
  '/:branchId/logo',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    if (!req.employee) {
      throw new AppError('Login required.', 401);
    }

    if (req.employee.role !== 'SUPER_ADMIN') {
      throw new AppError(
        'Only Super Admin can delete the restaurant logo.',
        403,
      );
    }

    const { branchId } = req.params;

    const branch = await prisma.branch.findUnique({
      where: {
        id: branchId,
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
    });

    if (!branch) {
      throw new AppError('Branch not found.', 404);
    }

    if (!branch.logoUrl) {
      throw new AppError(
        'This branch does not have a restaurant logo.',
        400,
      );
    }

    const oldLogoUrl = branch.logoUrl;

    const updatedBranch = await prisma.branch.update({
      where: {
        id: branch.id,
      },
      data: {
        logoUrl: null,
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
    });

    if (
      oldLogoUrl.startsWith(
        '/uploads/restaurant-logo/',
      )
    ) {
      const oldFileName = path.basename(
        oldLogoUrl,
      );

      const oldFilePath = path.join(
        process.cwd(),
        'uploads',
        'restaurant-logo',
        oldFileName,
      );

      try {
        await fs.unlink(oldFilePath);
      } catch {
        // The database reference has already been
        // removed, so a missing physical file is harmless.
      }
    }

    await logAudit({
      userId: req.employee.employeeId,
      userRole: req.employee.role,
      action: 'DELETE_RESTAURANT_LOGO',
      entity: 'Branch',
      entityId: branch.id,
      metadata: {
        branchId: branch.id,
        branchName: branch.name,
        deletedLogoUrl: oldLogoUrl,
      },
    });

    res.json({
      message: 'Restaurant logo deleted successfully.',
      branch: updatedBranch,
    });
  }),
);
export default router;