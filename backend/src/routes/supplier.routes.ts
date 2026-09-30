import {
  Router,
  Request,
  Response,
  NextFunction,
} from 'express';

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { requireEmployeeAuth } from '../middleware/auth';
import { AppError } from '../utils/errors';

const router = Router();
const prisma = new PrismaClient();

const asyncHandler =
  (
    handler: (
      req: Request,
      res: Response,
      next: NextFunction
    ) => Promise<void>
  ) =>
  (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    Promise.resolve(
      handler(req, res, next)
    ).catch(next);
  };

router.use(requireEmployeeAuth);

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(150),

  contactName: z
    .string()
    .trim()
    .max(150)
    .optional(),

  phone: z
    .string()
    .trim()
    .max(30)
    .optional(),

  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal('')),

  address: z
    .string()
    .trim()
    .max(500)
    .optional(),

  gstNumber: z
    .string()
    .trim()
    .max(50)
    .optional(),

  branchId: z
    .string()
    .uuid()
    .optional(),
});

function getEmployee(req: Request) {
  return (req as any).employee;
}

function getBranchId(
  req: Request,
  requestedBranchId?: string
): string {
  const employee = getEmployee(req);

  if (!employee) {
    throw new AppError(
      'Employee authentication required.',
      401
    );
  }

  if (employee.role === 'SUPER_ADMIN') {
    if (!requestedBranchId) {
      throw new AppError(
        'branchId is required.',
        400
      );
    }

    return requestedBranchId;
  }

  if (!employee.branchId) {
    throw new AppError(
      'Employee is not assigned to a branch.',
      400
    );
  }

  return employee.branchId;
}

function requireManagementRole(req: Request) {
  const employee = getEmployee(req);

  if (
    employee?.role !== 'SUPER_ADMIN' &&
    employee?.role !== 'MANAGER'
  ) {
    throw new AppError(
      'Supplier management denied.',
      403
    );
  }

  return employee;
}

/**
 * GET /api/suppliers
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const employee =
      requireManagementRole(req);

    const requestedBranchId =
      typeof req.query.branchId === 'string'
        ? req.query.branchId
        : undefined;

    const branchId = getBranchId(
      req,
      requestedBranchId
    );

    const suppliers =
      await prisma.supplier.findMany({
        where: {
          branchId,
        },

        orderBy: {
          name: 'asc',
        },

        include: {
          _count: {
            select: {
              purchases: true,
            },
          },
        },
      });

    res.json(suppliers);
  })
);

/**
 * GET /api/suppliers/:id
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const employee =
      requireManagementRole(req);

    const supplier =
      await prisma.supplier.findUnique({
        where: {
          id: req.params.id,
        },

        include: {
          purchases: {
            orderBy: {
              purchaseDate: 'desc',
            },

            take: 20,
          },
        },
      });

    if (!supplier) {
      throw new AppError(
        'Supplier not found.',
        404
      );
    }

    if (
      employee.role !== 'SUPER_ADMIN' &&
      supplier.branchId !== employee.branchId
    ) {
      throw new AppError(
        'Access denied.',
        403
      );
    }

    res.json(supplier);
  })
);

/**
 * POST /api/suppliers
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const employee =
      requireManagementRole(req);

    const data =
      supplierSchema.parse(req.body);

    const branchId = getBranchId(
      req,
      data.branchId
    );

    const existing =
      await prisma.supplier.findFirst({
        where: {
          branchId,
          name: data.name,
        },
      });

    if (existing) {
      throw new AppError(
        'A supplier with this name already exists in this branch.',
        409
      );
    }

    const supplier =
      await prisma.supplier.create({
        data: {
          name: data.name,

          contactName:
            data.contactName || null,

          phone:
            data.phone || null,

          email:
            data.email || null,

          address:
            data.address || null,

          gstNumber:
            data.gstNumber || null,

          branchId,
        },
      });

    await prisma.auditLog.create({
      data: {
        userId: employee.employeeId,

        userRole: employee.role,

        action: 'SUPPLIER_CREATED',

        entity: 'Supplier',

        entityId: supplier.id,

        metadata: {
          name: supplier.name,
          branchId,
        },
      },
    });

    res.status(201).json(supplier);
  })
);

/**
 * PUT /api/suppliers/:id
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const employee =
      requireManagementRole(req);

    const data =
      supplierSchema.parse(req.body);

    const supplier =
      await prisma.supplier.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!supplier) {
      throw new AppError(
        'Supplier not found.',
        404
      );
    }

    if (
      employee.role !== 'SUPER_ADMIN' &&
      supplier.branchId !== employee.branchId
    ) {
      throw new AppError(
        'Access denied.',
        403
      );
    }

    const existing =
      await prisma.supplier.findFirst({
        where: {
          branchId: supplier.branchId,

          name: data.name,

          NOT: {
            id: supplier.id,
          },
        },
      });

    if (existing) {
      throw new AppError(
        'A supplier with this name already exists in this branch.',
        409
      );
    }

    const updated =
      await prisma.supplier.update({
        where: {
          id: supplier.id,
        },

        data: {
          name: data.name,

          contactName:
            data.contactName || null,

          phone:
            data.phone || null,

          email:
            data.email || null,

          address:
            data.address || null,

          gstNumber:
            data.gstNumber || null,
        },
      });

    await prisma.auditLog.create({
      data: {
        userId: employee.employeeId,

        userRole: employee.role,

        action: 'SUPPLIER_UPDATED',

        entity: 'Supplier',

        entityId: updated.id,

        metadata: {
          name: updated.name,
        },
      },
    });

    res.json(updated);
  })
);

/**
 * PATCH /api/suppliers/:id/status
 */
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const employee =
      requireManagementRole(req);

    const statusSchema = z.object({
      status: z.enum([
        'ACTIVE',
        'INACTIVE',
      ]),
    });

    const { status } =
      statusSchema.parse(req.body);

    const supplier =
      await prisma.supplier.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!supplier) {
      throw new AppError(
        'Supplier not found.',
        404
      );
    }

    if (
      employee.role !== 'SUPER_ADMIN' &&
      supplier.branchId !== employee.branchId
    ) {
      throw new AppError(
        'Access denied.',
        403
      );
    }

    const updated =
      await prisma.supplier.update({
        where: {
          id: supplier.id,
        },

        data: {
          status,
        },
      });

    await prisma.auditLog.create({
      data: {
        userId: employee.employeeId,

        userRole: employee.role,

        action:
          'SUPPLIER_STATUS_CHANGED',

        entity: 'Supplier',

        entityId: updated.id,

        metadata: {
          status,
        },
      },
    });

    res.json(updated);
  })
);

export default router;