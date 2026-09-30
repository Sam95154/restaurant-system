import { Router, Request, Response } from 'express';
import { PrismaClient, ActiveStatus } from '@prisma/client';

import { z } from 'zod';

import { requireEmployeeAuth } from '../middleware/auth';
const router = Router();
const prisma = new PrismaClient();
router.use(requireEmployeeAuth);

const inventorySchema = z.object({
  name: z.string().trim().min(1, 'Inventory item name is required').max(150),
  sku: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  unit: z.string().trim().min(1, 'Inventory unit is required'),
  reorderLevel: z.coerce.number().min(0).default(0),
  averageCost: z.coerce.number().min(0).default(0),
  branchId: z.string().uuid(),
});

function getEmployee(req: Request) {
  return (req as any).employee;
}

function isManagementRole(role: string) {
  return role === 'SUPER_ADMIN' || role === 'MANAGER';
}

async function verifyBranchAccess(req: Request, branchId: string) {
  const employee = getEmployee(req);

  if (!employee) {
    return false;
  }

  if (employee.role === 'SUPER_ADMIN') {
    return true;
  }

  if (employee.role === 'MANAGER' && employee.branchId === branchId) {
    return true;
  }

  return false;
}

/*
 * GET /inventory
 * List inventory items for a branch.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const employee = getEmployee(req);

    if (!employee || !isManagementRole(employee.role)) {
      return res.status(403).json({
        message: 'Inventory access denied',
      });
    }

    const requestedBranchId =
      typeof req.query.branchId === 'string'
        ? req.query.branchId
        : undefined;

    const branchId =
      employee.role === 'SUPER_ADMIN'
        ? requestedBranchId
        : employee.branchId;

    if (!branchId) {
      return res.status(400).json({
        message: 'branchId is required',
      });
    }

    if (!(await verifyBranchAccess(req, branchId))) {
      return res.status(403).json({
        message: 'You do not have access to this branch',
      });
    }

    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim()
        : '';

    const status =
      typeof req.query.status === 'string'
        ? req.query.status
        : undefined;

    const items = await (prisma as any).inventoryItem.findMany({
      where: {
        branchId,
        ...(status === 'ACTIVE' || status === 'INACTIVE'
          ? { status: status as ActiveStatus }
          : {}),
        ...(search
          ? {
              OR: [
                {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  sku: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        stocks: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const result = items.map((item: {
      id: string;
      name: string;
      sku: string | null;
      description: string | null;
      unit: string;
      reorderLevel: number | string;
      status: ActiveStatus;
      branchId: string;
      stocks: Array<{
        quantity: number | string;
        averageCost: number | string;
      }>;
      createdAt: Date;
      updatedAt: Date;
    }) => {
      const stock = item.stocks[0];

      const quantity = Number(stock?.quantity ?? 0);
      const averageCost = Number(stock?.averageCost ?? 0);
      const reorderLevel = Number(item.reorderLevel);

      return {
        id: item.id,
        name: item.name,
        sku: item.sku,
        description: item.description,
        unit: item.unit,
        reorderLevel,
        status: item.status,
        branchId: item.branchId,
        stock: {
          quantity,
          averageCost,
          stockValue: quantity * averageCost,
          lowStock: quantity <= reorderLevel,
        },
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error('GET /inventory error:', error);

    return res.status(500).json({
      message: 'Failed to load inventory',
    });
  }
});

/*
 * GET /inventory/:id
 * Get one inventory item.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const employee = getEmployee(req);

    if (!employee || !isManagementRole(employee.role)) {
      return res.status(403).json({
        message: 'Inventory access denied',
      });
    }

    const item = await (prisma as any).inventoryItem.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        branch: true,
        stocks: true,
        movements: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
        },
      },
    });

    if (!item) {
      return res.status(404).json({
        message: 'Inventory item not found',
      });
    }

    if (!(await verifyBranchAccess(req, item.branchId))) {
      return res.status(403).json({
        message: 'You do not have access to this branch',
      });
    }

    const stock = item.stocks[0];

    return res.json({
      ...item,
      reorderLevel: Number(item.reorderLevel),
      stock: {
        quantity: Number(stock?.quantity ?? 0),
        averageCost: Number(stock?.averageCost ?? 0),
        stockValue:
          Number(stock?.quantity ?? 0) *
          Number(stock?.averageCost ?? 0),
        lowStock:
          Number(stock?.quantity ?? 0) <=
          Number(item.reorderLevel),
      },
    });
  } catch (error) {
    console.error('GET /inventory/:id error:', error);

    return res.status(500).json({
      message: 'Failed to load inventory item',
    });
  }
});

/*
 * POST /inventory
 * Create a new inventory item.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const employee = getEmployee(req);

    if (!employee || !isManagementRole(employee.role)) {
      return res.status(403).json({
        message: 'Inventory management denied',
      });
    }

    const parsed = inventorySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid inventory data',
        errors: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    if (!(await verifyBranchAccess(req, data.branchId))) {
      return res.status(403).json({
        message: 'You do not have access to this branch',
      });
    }

    const existing = await (prisma as any).inventoryItem.findFirst({
      where: {
        branchId: data.branchId,
        name: {
          equals: data.name,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        message: 'An inventory item with this name already exists',
      });
    }

    if (data.sku) {
      const skuExists = await (prisma as any).inventoryItem.findFirst({
        where: {
          branchId: data.branchId,
          sku: data.sku,
        },
      });

      if (skuExists) {
        return res.status(409).json({
          message: 'SKU already exists in this branch',
        });
      }
    }

    const item = await prisma.$transaction(async (tx) => {
      const created = await (tx as any).inventoryItem.create({
        data: {
          name: data.name,
          sku: data.sku || null,
          description: data.description || null,
          unit: data.unit,
          reorderLevel: data.reorderLevel,
          branchId: data.branchId,
          status: ActiveStatus.ACTIVE,
        },
      });

      await (tx as any).stock.create({
        data: {
          inventoryItemId: created.id,
          branchId: data.branchId,
          quantity: 0,
          averageCost: data.averageCost,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: employee.employeeId,
          userRole: employee.role,
          action: 'INVENTORY_ITEM_CREATED',
          entity: 'InventoryItem',
          entityId: created.id,
          metadata: {
            name: created.name,
            branchId: created.branchId,
          },
        },
      });

      return created;
    });

    return res.status(201).json(item);
  } catch (error: any) {
    console.error('POST /inventory error:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        message: 'Inventory item or SKU already exists',
      });
    }

    return res.status(500).json({
      message: 'Failed to create inventory item',
    });
  }
});

/*
 * PUT /inventory/:id
 * Update an inventory item.
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const employee = getEmployee(req);

    if (!employee || !isManagementRole(employee.role)) {
      return res.status(403).json({
        message: 'Inventory management denied',
      });
    }

    const item = await (prisma as any).inventoryItem.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!item) {
      return res.status(404).json({
        message: 'Inventory item not found',
      });
    }

    if (!(await verifyBranchAccess(req, item.branchId))) {
      return res.status(403).json({
        message: 'You do not have access to this branch',
      });
    }

    const parsed = inventorySchema.safeParse({
      ...req.body,
      branchId: item.branchId,
    });

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid inventory data',
        errors: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    const duplicate = await (prisma as any).inventoryItem.findFirst({
      where: {
        id: {
          not: item.id,
        },
        branchId: item.branchId,
        OR: [
          {
            name: {
              equals: data.name,
              mode: 'insensitive',
            },
          },
          ...(data.sku
            ? [{ sku: data.sku }]
            : []),
        ],
      },
    });

    if (duplicate) {
      return res.status(409).json({
        message: 'Another inventory item already uses this name or SKU',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await (tx as any).inventoryItem.update({
        where: {
          id: item.id,
        },
        data: {
          name: data.name,
          sku: data.sku || null,
          description: data.description || null,
          unit: data.unit,
          reorderLevel: data.reorderLevel,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: employee.employeeId,
          userRole: employee.role,
          action: 'INVENTORY_ITEM_UPDATED',
          entity: 'InventoryItem',
          entityId: result.id,
          metadata: {
            name: result.name,
            branchId: result.branchId,
          },
        },
      });

      return result;
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('PUT /inventory/:id error:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        message: 'Inventory item or SKU already exists',
      });
    }

    return res.status(500).json({
      message: 'Failed to update inventory item',
    });
  }
});

/*
 * PATCH /inventory/:id/status
 * Activate or deactivate an inventory item.
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const employee = getEmployee(req);

    if (!employee || !isManagementRole(employee.role)) {
      return res.status(403).json({
        message: 'Inventory management denied',
      });
    }

    const statusSchema = z.object({
      status: z.nativeEnum(ActiveStatus),
    });

    const parsed = statusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Status must be ACTIVE or INACTIVE',
      });
    }

    const item = await (prisma as any).inventoryItem.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!item) {
      return res.status(404).json({
        message: 'Inventory item not found',
      });
    }

    if (!(await verifyBranchAccess(req, item.branchId))) {
      return res.status(403).json({
        message: 'You do not have access to this branch',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await (tx as any).inventoryItem.update({
        where: {
          id: item.id,
        },
        data: {
          status: parsed.data.status,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: employee.employeeId,
          userRole: employee.role,
          action: 'INVENTORY_STATUS_CHANGED',
          entity: 'InventoryItem',
          entityId: result.id,
          metadata: {
            oldStatus: item.status,
            newStatus: result.status,
          },
        },
      });

      return result;
    });

    return res.json(updated);
  } catch (error) {
    console.error('PATCH /inventory/:id/status error:', error);

    return res.status(500).json({
      message: 'Failed to update inventory status',
    });
  }
});

export default router;