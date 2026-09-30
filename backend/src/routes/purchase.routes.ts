import {
  Router,
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  PrismaClient,
  Prisma,
} from '@prisma/client';

import { z } from 'zod';

import { requireEmployeeAuth } from '../middleware/auth';
import { AppError } from '../utils/errors';

const router = Router();
const prisma = new PrismaClient();

router.use(requireEmployeeAuth);

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

function getEmployee(req: Request) {
  return (req as any).employee;
}

function requireManagementRole(req: Request) {
  const employee = getEmployee(req);

  if (
    employee?.role !== 'SUPER_ADMIN' &&
    employee?.role !== 'MANAGER'
  ) {
    throw new AppError(
      'Purchase management denied.',
      403
    );
  }

  return employee;
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

const purchaseItemSchema = z.object({
  inventoryItemId: z.string().uuid(),

  quantity: z.coerce
    .number()
    .positive(),

  unitCost: z.coerce
    .number()
    .min(0),
});

const purchaseSchema = z.object({
  supplierId: z.string().uuid(),

  invoiceNumber: z
    .string()
    .trim()
    .max(100)
    .optional(),

  purchaseDate: z
    .coerce
    .date()
    .optional(),

  notes: z
    .string()
    .trim()
    .max(1000)
    .optional(),

  status: z
    .enum(['DRAFT', 'RECEIVED'])
    .default('DRAFT'),

  branchId: z
    .string()
    .uuid()
    .optional(),

  items: z
    .array(purchaseItemSchema)
    .min(1),
});

/**
 * GET /api/purchases
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

    const purchases =
      await prisma.purchase.findMany({
        where: {
          branchId,
        },

        orderBy: {
          purchaseDate: 'desc',
        },

        include: {
          supplier: true,

          items: {
            include: {
              inventoryItem: true,
            },
          },
        },
      });

    res.json(purchases);
  })
);

/**
 * GET /api/purchases/:id
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const employee =
      requireManagementRole(req);

    const purchase =
      await prisma.purchase.findUnique({
        where: {
          id: req.params.id,
        },

        include: {
          supplier: true,

          items: {
            include: {
              inventoryItem: true,
            },
          },
        },
      });

    if (!purchase) {
      throw new AppError(
        'Purchase not found.',
        404
      );
    }

    if (
      employee.role !== 'SUPER_ADMIN' &&
      purchase.branchId !== employee.branchId
    ) {
      throw new AppError(
        'Access denied.',
        403
      );
    }

    res.json(purchase);
  })
);

/**
 * POST /api/purchases
 *
 * Creates a purchase.
 *
 * DRAFT:
 * - Creates purchase and items.
 * - Does NOT change stock.
 *
 * RECEIVED:
 * - Creates purchase and items.
 * - Updates stock.
 * - Updates weighted average cost.
 * - Creates stock movements.
 *
 * Everything happens inside one transaction.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const employee =
      requireManagementRole(req);

    const data =
      purchaseSchema.parse(req.body);

    const branchId = getBranchId(
      req,
      data.branchId
    );

    const supplier =
      await prisma.supplier.findUnique({
        where: {
          id: data.supplierId,
        },
      });

    if (!supplier) {
      throw new AppError(
        'Supplier not found.',
        404
      );
    }

    if (supplier.branchId !== branchId) {
      throw new AppError(
        'Supplier does not belong to this branch.',
        403
      );
    }

    if (supplier.status !== 'ACTIVE') {
      throw new AppError(
        'The selected supplier is inactive.',
        400
      );
    }

    const inventoryItemIds =
      data.items.map(
        (item) => item.inventoryItemId
      );

    const inventoryItems =
      await prisma.inventoryItem.findMany({
        where: {
          id: {
            in: inventoryItemIds,
          },

          branchId,
        },
      });

    if (
      inventoryItems.length !==
      new Set(inventoryItemIds).size
    ) {
      throw new AppError(
        'One or more inventory items are invalid for this branch.',
        400
      );
    }

    const inventoryMap = new Map(
      inventoryItems.map((item) => [
        item.id,
        item,
      ])
    );

    const calculatedItems =
      data.items.map((item) => {
        const inventoryItem =
          inventoryMap.get(
            item.inventoryItemId
          );

        if (!inventoryItem) {
          throw new AppError(
            'Inventory item not found.',
            404
          );
        }

        const quantity =
          new Prisma.Decimal(
            item.quantity
          );

        const unitCost =
          new Prisma.Decimal(
            item.unitCost
          );

        const totalCost =
          quantity.mul(unitCost);

        return {
          inventoryItem,
          quantity,
          unitCost,
          totalCost,
        };
      });

    const subtotal =
      calculatedItems.reduce(
        (
          total,
          item
        ) =>
          total.add(item.totalCost),
        new Prisma.Decimal(0)
      );

    const tax =
      new Prisma.Decimal(0);

    const total =
      subtotal.add(tax);

    const purchase =
      await prisma.$transaction(
        async (tx) => {
          const created =
            await tx.purchase.create({
              data: {
                invoiceNumber:
                  data.invoiceNumber ||
                  null,

                purchaseDate:
                  data.purchaseDate ||
                  new Date(),

                status:
                  data.status ===
                  'RECEIVED'
                    ? 'RECEIVED'
                    : 'DRAFT',

                subtotal,

                tax,

                total,

                notes:
                  data.notes ||
                  null,

                branchId,

                supplierId:
                  supplier.id,

                items: {
                  create:
                    calculatedItems.map(
                      (item) => ({
                        quantity:
                          item.quantity,

                        unitCost:
                          item.unitCost,

                        totalCost:
                          item.totalCost,

                        inventoryItemId:
                          item
                            .inventoryItem
                            .id,
                      })
                    ),
                },
              },

              include: {
                supplier: true,

                items: {
                  include: {
                    inventoryItem:
                      true,
                  },
                },
              },
            });

          /**
           * If the purchase is immediately
           * received, update stock.
           */
          if (data.status === 'RECEIVED') {
            for (const item of calculatedItems) {
              const existingStock =
                await tx.stock.findUnique({
                  where: {
                    branchId_inventoryItemId:
                      {
                        branchId,
                        inventoryItemId:
                          item
                            .inventoryItem
                            .id,
                      },
                  },
                });

              if (!existingStock) {
                await tx.stock.create({
                  data: {
                    branchId,

                    inventoryItemId:
                      item
                        .inventoryItem
                        .id,

                    quantity:
                      item.quantity,

                    averageCost:
                      item.unitCost,
                  },
                });
              } else {
                const oldQuantity =
                  new Prisma.Decimal(
                    existingStock.quantity
                  );

                const oldAverageCost =
                  new Prisma.Decimal(
                    existingStock.averageCost
                  );

                const newQuantity =
                  oldQuantity.add(
                    item.quantity
                  );

                let newAverageCost =
                  item.unitCost;

                if (
                  newQuantity.gt(0)
                ) {
                  const oldStockValue =
                    oldQuantity.mul(
                      oldAverageCost
                    );

                  const newStockValue =
                    item.quantity.mul(
                      item.unitCost
                    );

                  newAverageCost =
                    oldStockValue
                      .add(newStockValue)
                      .div(newQuantity);
                }

                await tx.stock.update({
                  where: {
                    id: existingStock.id,
                  },

                  data: {
                    quantity:
                      newQuantity,

                    averageCost:
                      newAverageCost,
                  },
                });
              }

              await tx.stockMovement.create({
                data: {
                  type: 'PURCHASE',

                  quantity:
                    item.quantity,

                  unitCost:
                    item.unitCost,

                  referenceType:
                    'PURCHASE',

                  referenceId:
                    created.id,

                  notes:
                    `Purchase #${created.purchaseNumber}`,

                  branchId,

                  inventoryItemId:
                    item
                      .inventoryItem
                      .id,

                  createdById:
                    employee.employeeId,
                },
              });
            }
          }

          return created;
        }
      );

    await prisma.auditLog.create({
      data: {
        userId:
          employee.employeeId,

        userRole:
          employee.role,

        action:
          data.status ===
          'RECEIVED'
            ? 'PURCHASE_RECEIVED'
            : 'PURCHASE_CREATED',

        entity: 'Purchase',

        entityId:
          purchase.id,

        metadata: {
          purchaseNumber:
            purchase.purchaseNumber,

          branchId,

          supplierId:
            supplier.id,

          total:
            total.toString(),

          status:
            data.status,
        },
      },
    });

    res.status(201).json(purchase);
  })
);

/**
 * PATCH /api/purchases/:id/receive
 *
 * Converts a DRAFT purchase into
 * RECEIVED and updates stock.
 */
router.patch(
  '/:id/receive',
  asyncHandler(async (req, res) => {
    const employee =
      requireManagementRole(req);

    const purchase =
      await prisma.purchase.findUnique({
        where: {
          id: req.params.id,
        },

        include: {
          supplier: true,

          items: {
            include: {
              inventoryItem: true,
            },
          },
        },
      });

    if (!purchase) {
      throw new AppError(
        'Purchase not found.',
        404
      );
    }

    if (
      employee.role !== 'SUPER_ADMIN' &&
      purchase.branchId !== employee.branchId
    ) {
      throw new AppError(
        'Access denied.',
        403
      );
    }

    if (purchase.status !== 'DRAFT') {
      throw new AppError(
        'Only draft purchases can be received.',
        400
      );
    }

    const received =
      await prisma.$transaction(
        async (tx) => {
          for (const item of purchase.items) {
            const existingStock =
              await tx.stock.findUnique({
                where: {
                  branchId_inventoryItemId:
                    {
                      branchId:
                        purchase.branchId,

                      inventoryItemId:
                        item
                          .inventoryItemId,
                    },
                },
              });

            const purchaseQuantity =
              new Prisma.Decimal(
                item.quantity
              );

            const purchaseUnitCost =
              new Prisma.Decimal(
                item.unitCost
              );

            if (!existingStock) {
              await tx.stock.create({
                data: {
                  branchId:
                    purchase.branchId,

                  inventoryItemId:
                    item
                      .inventoryItemId,

                  quantity:
                    purchaseQuantity,

                  averageCost:
                    purchaseUnitCost,
                },
              });
            } else {
              const oldQuantity =
                new Prisma.Decimal(
                  existingStock.quantity
                );

              const oldAverageCost =
                new Prisma.Decimal(
                  existingStock.averageCost
                );

              const newQuantity =
                oldQuantity.add(
                  purchaseQuantity
                );

              const oldStockValue =
                oldQuantity.mul(
                  oldAverageCost
                );

              const newStockValue =
                purchaseQuantity.mul(
                  purchaseUnitCost
                );

              const newAverageCost =
                newQuantity.gt(0)
                  ? oldStockValue
                      .add(newStockValue)
                      .div(newQuantity)
                  : purchaseUnitCost;

              await tx.stock.update({
                where: {
                  id:
                    existingStock.id,
                },

                data: {
                  quantity:
                    newQuantity,

                  averageCost:
                    newAverageCost,
                },
              });
            }

            await tx.stockMovement.create({
              data: {
                type: 'PURCHASE',

                quantity:
                  purchaseQuantity,

                unitCost:
                  purchaseUnitCost,

                referenceType:
                  'PURCHASE',

                referenceId:
                  purchase.id,

                notes:
                  `Purchase #${purchase.purchaseNumber}`,

                branchId:
                  purchase.branchId,

                inventoryItemId:
                  item.inventoryItemId,

                createdById:
                  employee.employeeId,
              },
            });
          }

          return tx.purchase.update({
            where: {
              id:
                purchase.id,
            },

            data: {
              status: 'RECEIVED',
            },

            include: {
              supplier: true,

              items: {
                include: {
                  inventoryItem:
                    true,
                },
              },
            },
          });
        }
      );

    await prisma.auditLog.create({
      data: {
        userId:
          employee.employeeId,

        userRole:
          employee.role,

        action:
          'PURCHASE_RECEIVED',

        entity:
          'Purchase',

        entityId:
          received.id,

        metadata: {
          purchaseNumber:
            received.purchaseNumber,

          total:
            received.total.toString(),
        },
      },
    });

    res.json(received);
  })
);

/**
 * PATCH /api/purchases/:id/cancel
 */
router.patch(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const employee =
      requireManagementRole(req);

    const purchase =
      await prisma.purchase.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!purchase) {
      throw new AppError(
        'Purchase not found.',
        404
      );
    }

    if (
      employee.role !== 'SUPER_ADMIN' &&
      purchase.branchId !== employee.branchId
    ) {
      throw new AppError(
        'Access denied.',
        403
      );
    }

    if (purchase.status !== 'DRAFT') {
      throw new AppError(
        'Only draft purchases can be cancelled.',
        400
      );
    }

    const cancelled =
      await prisma.purchase.update({
        where: {
          id: purchase.id,
        },

        data: {
          status: 'CANCELLED',
        },
      });

    await prisma.auditLog.create({
      data: {
        userId:
          employee.employeeId,

        userRole:
          employee.role,

        action:
          'PURCHASE_CANCELLED',

        entity:
          'Purchase',

        entityId:
          cancelled.id,

        metadata: {
          purchaseNumber:
            cancelled.purchaseNumber,
        },
      },
    });

    res.json(cancelled);
  })
);

export default router;