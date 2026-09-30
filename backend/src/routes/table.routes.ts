import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError, NotFoundError } from '../utils/errors';
import { logAudit } from '../services/audit.service';

const router = Router();

const tableStatusSchema = z.enum([
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'CLEANING',
  'OUT_OF_SERVICE',
]);

const tableSchema = z.object({
  number: z.number().int().positive(),
  capacity: z.number().int().positive(),
  branchId: z.string().uuid(),
});

const updateTableSchema = z.object({
  number: z.number().int().positive(),
  capacity: z.number().int().positive(),
});

function assertBranchAccess(
  employee: {
    role: string;
    branchId?: string | null;
  },
  branchId: string
) {
  if (
    employee.role !== 'SUPER_ADMIN' &&
    employee.branchId !== branchId
  ) {
    throw new AppError(
      'You do not have access to this branch.',
      403
    );
  }
}

/*
|--------------------------------------------------------------------------
| GET TABLES
|--------------------------------------------------------------------------
| Staff can see tables belonging to their authorized branch.
| Public customers can also read tables for a selected branch because the
| customer QR ordering page needs to resolve the table.
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const branchId = z
      .string()
      .uuid()
      .parse(req.query.branchId);

    if (req.employee) {
      assertBranchAccess(req.employee, branchId);
    }

    const tables = await prisma.restaurantTable.findMany({
      where: {
        branchId,
      },
      orderBy: {
        number: 'asc',
      },
      include: {
        sessions: {
          where: {
            status: 'OPEN',
          },
          orderBy: {
            openedAt: 'desc',
          },
          take: 1,
          include: {
            orders: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 10,
              select: {
                id: true,
                orderNumber: true,
                type: true,
                status: true,
                total: true,
                createdAt: true,
              },
            },
            bills: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 5,
              select: {
                id: true,
                billNumber: true,
                total: true,
                paymentStatus: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    res.json({
      tables,
    });
  })
);

/*
|--------------------------------------------------------------------------
| GET PUBLIC TABLE
|--------------------------------------------------------------------------
| Used by QR ordering.
|
| IMPORTANT:
| The QR contains the permanent database table UUID.
| We do NOT identify a table only by its number.
|--------------------------------------------------------------------------
*/

router.get(
  '/public/:id',
  asyncHandler(async (req, res) => {
    const table = await prisma.restaurantTable.findUnique({
      where: {
        id: req.params.id,
      },
      select: {
        id: true,
        number: true,
        capacity: true,
        status: true,
        branchId: true,
        branch: {
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
        },
      },
    });

    if (!table) {
      throw new NotFoundError('Table not found.');
    }

    if (
      table.branch.status === 'CLOSED' ||
      table.branch.status === 'TEMPORARILY_CLOSED' ||
      table.branch.status === 'PERMANENTLY_CLOSED'
    ) {
      throw new AppError(
        'This restaurant branch is currently unavailable.',
        409
      );
    }

    if (table.status === 'OUT_OF_SERVICE') {
      throw new AppError(
        'This table is currently unavailable.',
        409
      );
    }

    res.json({
      table,
    });
  })
);

/*
|--------------------------------------------------------------------------
| CREATE TABLE
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const data = tableSchema.parse(req.body);

    assertBranchAccess(
      req.employee!,
      data.branchId
    );

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
      throw new NotFoundError('Branch not found.');
    }

    if (branch.status === 'PERMANENTLY_CLOSED') {
      throw new AppError(
        'Tables cannot be added to a permanently closed branch.',
        409
      );
    }

    const existing = await prisma.restaurantTable.findFirst({
      where: {
        branchId: data.branchId,
        number: data.number,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new AppError(
        `Table ${data.number} already exists in this branch.`,
        409
      );
    }

    /*
     * IMPORTANT:
     * Prisma generates the RestaurantTable UUID automatically.
     *
     * That UUID becomes the permanent identity of this table.
     * The QR code will use this ID.
     *
     * Therefore:
     *
     * Table A -> UUID A -> QR A
     * Table B -> UUID B -> QR B
     *
     * A newly created table always receives a different UUID.
     */
    const table = await prisma.restaurantTable.create({
      data: {
        number: data.number,
        capacity: data.capacity,
        branchId: data.branchId,
        status: 'AVAILABLE',
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'CREATE_TABLE',
      entity: 'RestaurantTable',
      entityId: table.id,
    });

    res.status(201).json({
      table,
    });
  })
);

/*
|--------------------------------------------------------------------------
| UPDATE TABLE
|--------------------------------------------------------------------------
| QR identity does NOT change.
|
| Editing:
| - table number
| - capacity
|
| does not create a new table and does not change the table UUID.
|--------------------------------------------------------------------------
*/

router.put(
  '/:id',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const data = updateTableSchema.parse(req.body);

    const existing = await prisma.restaurantTable.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Table not found.');
    }

    assertBranchAccess(
      req.employee!,
      existing.branchId
    );

    const duplicate = await prisma.restaurantTable.findFirst({
      where: {
        branchId: existing.branchId,
        number: data.number,
        NOT: {
          id: existing.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      throw new AppError(
        `Table ${data.number} already exists in this branch.`,
        409
      );
    }

    const table = await prisma.restaurantTable.update({
      where: {
        id: existing.id,
      },
      data: {
        number: data.number,
        capacity: data.capacity,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'UPDATE_TABLE',
      entity: 'RestaurantTable',
      entityId: table.id,
    });

    res.json({
      table,
    });
  })
);

/*
|--------------------------------------------------------------------------
| UPDATE TABLE STATUS
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id/status',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN',
    'MANAGER',
    'SERVICE_EMPLOYEE'
  ),
  asyncHandler(async (req, res) => {
    const status = tableStatusSchema.parse(
      req.body.status
    );

    const existing = await prisma.restaurantTable.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Table not found.');
    }

    assertBranchAccess(
      req.employee!,
      existing.branchId
    );

    /*
     * Prevent manually marking a table AVAILABLE while it still
     * has an open session. This protects billing/session integrity.
     */
    if (status === 'AVAILABLE') {
      const openSession =
        await prisma.tableSession.findFirst({
          where: {
            tableId: existing.id,
            status: 'OPEN',
          },
          select: {
            id: true,
          },
        });

      if (openSession) {
        throw new AppError(
          'This table has an open session. Close the session before marking it available.',
          409
        );
      }
    }

    const table = await prisma.restaurantTable.update({
      where: {
        id: existing.id,
      },
      data: {
        status,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'UPDATE_TABLE_STATUS',
      entity: 'RestaurantTable',
      entityId: table.id,
    });

    res.json({
      table,
    });
  })
);

/*
|--------------------------------------------------------------------------
| CREATE / GET TABLE SESSION
|--------------------------------------------------------------------------
*/

router.post(
  '/:id/sessions',
  requireEmployeeAuth,
  requireRole(
    'SUPER_ADMIN',
    'MANAGER',
    'SERVICE_EMPLOYEE'
  ),
  asyncHandler(async (req, res) => {
    const table = await prisma.restaurantTable.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!table) {
      throw new NotFoundError('Table not found.');
    }

    assertBranchAccess(
      req.employee!,
      table.branchId
    );

    if (table.status === 'OUT_OF_SERVICE') {
      throw new AppError(
        'This table is out of service.',
        409
      );
    }

    const existing =
      await prisma.tableSession.findFirst({
        where: {
          tableId: table.id,
          status: 'OPEN',
        },
        include: {
          orders: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

    if (existing) {
      return res.json({
        session: existing,
      });
    }

    const session =
      await prisma.$transaction(async (tx) => {
        const created =
          await tx.tableSession.create({
            data: {
              tableId: table.id,
            },
          });

        await tx.restaurantTable.update({
          where: {
            id: table.id,
          },
          data: {
            status: 'OCCUPIED',
          },
        });

        return created;
      });

    res.status(201).json({
      session,
    });
  })
);

/*
|--------------------------------------------------------------------------
| GET TABLE SESSION
|--------------------------------------------------------------------------
*/

router.get(
  '/sessions/:sessionId',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const session =
      await prisma.tableSession.findUnique({
        where: {
          id: req.params.sessionId,
        },
        include: {
          orders: {
            include: {
              items: true,
              statusHistory: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          table: true,
          bills: true,
        },
      });

    if (!session) {
      throw new NotFoundError(
        'Table session not found.'
      );
    }

    assertBranchAccess(
      req.employee!,
      session.table.branchId
    );

    res.json({
      session,
    });
  })
);

export default router;