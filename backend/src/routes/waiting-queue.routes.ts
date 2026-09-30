import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError, NotFoundError } from '../utils/errors';
import { logAudit } from '../services/audit.service';

const router = Router();

const managementRoles = [
  'SUPER_ADMIN',
  'MANAGER',
  'SERVICE_EMPLOYEE',
] as const;

const createQueueSchema = z.object({
  branchId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(20),
  partySize: z.number().int().min(1).max(50),
});

const statusSchema = z.object({
  status: z.enum([
    'WAITING',
    'CALLED',
    'SEATED',
    'CANCELLED',
    'NO_SHOW',
  ]),
});

const assignTableSchema = z.object({
  tableId: z.string().uuid(),
});

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

async function getNextTokenNumber(branchId: string) {
  const latest = await prisma.waitingQueue.findFirst({
    where: {
      branchId,
    },
    orderBy: {
      tokenNumber: 'desc',
    },
    select: {
      tokenNumber: true,
    },
  });

  return (latest?.tokenNumber ?? 0) + 1;
}

async function getQueueEntry(id: string) {
  const queue = await prisma.waitingQueue.findUnique({
    where: {
      id,
    },
    include: {
      branch: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          status: true,
        },
      },
      assignedTable: {
        select: {
          id: true,
          number: true,
          capacity: true,
          status: true,
        },
      },
    },
  });

  if (!queue) {
    throw new NotFoundError('Waiting queue entry not found.');
  }

  return queue;
}

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
| PUBLIC — JOIN WAITING QUEUE
|--------------------------------------------------------------------------
|
| Customer scans the permanent queue QR at the restaurant entrance.
|
*/

router.post(
  '/public/join',
  asyncHandler(async (req, res) => {
    const data = createQueueSchema.parse(req.body);

    const branch = await prisma.branch.findUnique({
      where: {
        id: data.branchId,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!branch) {
      throw new NotFoundError('Restaurant branch not found.');
    }

    if (
      branch.status === 'CLOSED' ||
      branch.status === 'TEMPORARILY_CLOSED' ||
      branch.status === 'PERMANENTLY_CLOSED'
    ) {
      throw new AppError(
        'This restaurant branch is currently unavailable.',
        409
      );
    }

    /*
     * Generate the next token number inside a transaction.
     */
    const queue = await prisma.$transaction(async (tx) => {
      const latest = await tx.waitingQueue.findFirst({
        where: {
          branchId: data.branchId,
        },
        orderBy: {
          tokenNumber: 'desc',
        },
        select: {
          tokenNumber: true,
        },
      });

      const tokenNumber = (latest?.tokenNumber ?? 0) + 1;

      return tx.waitingQueue.create({
        data: {
          tokenNumber,
          queueToken: randomUUID(),
          customerName: data.customerName,
          phone: data.phone,
          partySize: data.partySize,
          branchId: data.branchId,
          status: 'WAITING',
        },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
            },
          },
        },
      });
    });

    const position = await prisma.waitingQueue.count({
      where: {
        branchId: data.branchId,
        status: 'WAITING',
        createdAt: {
          lte: queue.createdAt,
        },
      },
    });

    res.status(201).json({
      queue,
      position,
      message: 'You have joined the waiting queue.',
    });
  })
);

/*
|--------------------------------------------------------------------------
| PUBLIC — CHECK QUEUE STATUS
|--------------------------------------------------------------------------
|
| Customer uses the private queue token returned after registration.
|
*/

router.get(
  '/public/:queueToken',
  asyncHandler(async (req, res) => {
    const queue = await prisma.waitingQueue.findUnique({
      where: {
        queueToken: req.params.queueToken,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        assignedTable: {
          select: {
            id: true,
            number: true,
            capacity: true,
            status: true,
          },
        },
      },
    });

    if (!queue) {
      throw new NotFoundError('Queue token not found.');
    }

    let position: number | null = null;

    if (queue.status === 'WAITING') {
      position =
        (await prisma.waitingQueue.count({
          where: {
            branchId: queue.branchId,
            status: 'WAITING',
            createdAt: {
              lt: queue.createdAt,
            },
          },
        })) + 1;
    }

    res.json({
      queue,
      position,
    });
  })
);

/*
|--------------------------------------------------------------------------
| STAFF — GET QUEUE
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  requireEmployeeAuth,
  requireRole(...managementRoles),
  asyncHandler(async (req, res) => {
    const requestedBranchId = req.query.branchId
      ? z.string().uuid().parse(req.query.branchId)
      : req.employee!.branchId;

    if (!requestedBranchId) {
      throw new AppError(
        'A branch must be selected.',
        400
      );
    }

    assertBranchAccess(
      req.employee!,
      requestedBranchId
    );

    const status = req.query.status
      ? statusSchema.shape.status.parse(req.query.status)
      : undefined;

    const queue = await prisma.waitingQueue.findMany({
      where: {
        branchId: requestedBranchId,
        ...(status ? { status } : {}),
      },
      orderBy: [
        {
          status: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
      include: {
        assignedTable: {
          select: {
            id: true,
            number: true,
            capacity: true,
            status: true,
          },
        },
      },
    });

    res.json({
      queue,
    });
  })
);

/*
|--------------------------------------------------------------------------
| STAFF — GET QUEUE ENTRY
|--------------------------------------------------------------------------
*/

router.get(
  '/:id',
  requireEmployeeAuth,
  requireRole(...managementRoles),
  asyncHandler(async (req, res) => {
    const queue = await getQueueEntry(req.params.id);

    assertBranchAccess(
      req.employee!,
      queue.branchId
    );

    res.json({
      queue,
    });
  })
);

/*
|--------------------------------------------------------------------------
| STAFF — CALL CUSTOMER
|--------------------------------------------------------------------------
*/

router.post(
  '/:id/call',
  requireEmployeeAuth,
  requireRole(...managementRoles),
  asyncHandler(async (req, res) => {
    const queue = await getQueueEntry(req.params.id);

    assertBranchAccess(
      req.employee!,
      queue.branchId
    );

    if (queue.status !== 'WAITING') {
      throw new AppError(
        `This queue entry cannot be called because its current status is ${queue.status}.`,
        409
      );
    }

    const updated = await prisma.waitingQueue.update({
      where: {
        id: queue.id,
      },
      data: {
        status: 'CALLED',
        calledAt: new Date(),
      },
      include: {
        assignedTable: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'CALL_WAITING_QUEUE',
      entity: 'WaitingQueue',
      entityId: updated.id,
      metadata: {
        tokenNumber: updated.tokenNumber,
        customerName: updated.customerName,
      },
    });

    res.json({
      queue: updated,
      message: `Token ${updated.tokenNumber} has been called.`,
    });
  })
);

/*
|--------------------------------------------------------------------------
| STAFF — ASSIGN TABLE
|--------------------------------------------------------------------------
*/

router.post(
  '/:id/assign-table',
  requireEmployeeAuth,
  requireRole(...managementRoles),
  asyncHandler(async (req, res) => {
    const { tableId } = assignTableSchema.parse(req.body);

    const queue = await getQueueEntry(req.params.id);

    assertBranchAccess(
      req.employee!,
      queue.branchId
    );

    if (
      queue.status !== 'WAITING' &&
      queue.status !== 'CALLED'
    ) {
      throw new AppError(
        'A table can only be assigned to a waiting or called customer.',
        409
      );
    }

    const table = await prisma.restaurantTable.findUnique({
      where: {
        id: tableId,
      },
      select: {
        id: true,
        number: true,
        capacity: true,
        status: true,
        branchId: true,
        sessions: {
          where: {
            status: 'OPEN',
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!table) {
      throw new NotFoundError('Table not found.');
    }

    if (table.branchId !== queue.branchId) {
      throw new AppError(
        'The selected table belongs to another branch.',
        403
      );
    }

    if (table.status !== 'AVAILABLE') {
      throw new AppError(
        'This table is not currently available.',
        409
      );
    }

    if (table.sessions.length > 0) {
      throw new AppError(
        'This table already has an open session.',
        409
      );
    }

    if (table.capacity < queue.partySize) {
      throw new AppError(
        `Table ${table.number} can seat ${table.capacity} people, but this party has ${queue.partySize}.`,
        409
      );
    }

    const updated = await prisma.waitingQueue.update({
      where: {
        id: queue.id,
      },
      data: {
        assignedTableId: table.id,
      },
      include: {
        assignedTable: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'ASSIGN_WAITING_QUEUE_TABLE',
      entity: 'WaitingQueue',
      entityId: updated.id,
      metadata: {
        tokenNumber: updated.tokenNumber,
        tableId: table.id,
        tableNumber: table.number,
      },
    });

    res.json({
      queue: updated,
      message: `Table ${table.number} assigned to token ${updated.tokenNumber}.`,
    });
  })
);

/*
|--------------------------------------------------------------------------
| STAFF — SEAT CUSTOMER
|--------------------------------------------------------------------------
|
| Creates the normal TableSession and marks the table OCCUPIED.
|
*/

router.post(
  '/:id/seat',
  requireEmployeeAuth,
  requireRole(...managementRoles),
  asyncHandler(async (req, res) => {
    const queue = await getQueueEntry(req.params.id);

    assertBranchAccess(
      req.employee!,
      queue.branchId
    );

    if (
      queue.status !== 'CALLED' &&
      queue.status !== 'WAITING'
    ) {
      throw new AppError(
        'This customer cannot be seated from the current queue status.',
        409
      );
    }

    if (!queue.assignedTableId) {
      throw new AppError(
        'Assign a table before seating the customer.',
        409
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const table = await tx.restaurantTable.findUnique({
          where: {
            id: queue.assignedTableId!,
          },
          select: {
            id: true,
            number: true,
            capacity: true,
            status: true,
            branchId: true,
          },
        });

        if (!table) {
          throw new NotFoundError('Assigned table not found.');
        }

        if (table.branchId !== queue.branchId) {
          throw new AppError(
            'The assigned table belongs to another branch.',
            403
          );
        }

        if (table.capacity < queue.partySize) {
          throw new AppError(
            'The assigned table cannot accommodate this party.',
            409
          );
        }

        const openSession =
          await tx.tableSession.findFirst({
            where: {
              tableId: table.id,
              status: 'OPEN',
            },
            select: {
              id: true,
            },
          });

        if (openSession) {
          throw new AppError(
            'The assigned table already has an open session.',
            409
          );
        }

        if (table.status !== 'AVAILABLE') {
          throw new AppError(
            'The assigned table is no longer available.',
            409
          );
        }

        const session =
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

        const updatedQueue =
          await tx.waitingQueue.update({
            where: {
              id: queue.id,
            },
            data: {
              status: 'SEATED',
              seatedAt: new Date(),
            },
            include: {
              assignedTable: true,
            },
          });

        return {
          queue: updatedQueue,
          session,
        };
      }
    );

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'SEAT_WAITING_QUEUE',
      entity: 'WaitingQueue',
      entityId: result.queue.id,
      metadata: {
        tokenNumber: result.queue.tokenNumber,
        tableId: result.queue.assignedTableId,
        sessionId: result.session.id,
      },
    });

    res.json({
      queue: result.queue,
      session: result.session,
      message: `Token ${result.queue.tokenNumber} has been seated.`,
    });
  })
);

/*
|--------------------------------------------------------------------------
| STAFF — UPDATE STATUS
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id/status',
  requireEmployeeAuth,
  requireRole(...managementRoles),
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body);

    const queue = await getQueueEntry(req.params.id);

    assertBranchAccess(
      req.employee!,
      queue.branchId
    );

    if (queue.status === 'SEATED') {
      throw new AppError(
        'A seated queue entry cannot be changed from the queue.',
        409
      );
    }

    const data: {
      status: typeof status;
      cancelledAt?: Date;
      calledAt?: Date;
    } = {
      status,
    };

    if (status === 'CANCELLED') {
      data.cancelledAt = new Date();
    }

    if (status === 'CALLED') {
      data.calledAt = new Date();
    }

    const updated = await prisma.waitingQueue.update({
      where: {
        id: queue.id,
      },
      data,
      include: {
        assignedTable: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'UPDATE_WAITING_QUEUE_STATUS',
      entity: 'WaitingQueue',
      entityId: updated.id,
      metadata: {
        tokenNumber: updated.tokenNumber,
        status: updated.status,
      },
    });

    res.json({
      queue: updated,
    });
  })
);

export default router;