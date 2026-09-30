import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();

function branchFilterFor(req: any) {
  if (req.employee.role === 'SUPER_ADMIN') {
    return req.query.branchId ? z.string().uuid().parse(req.query.branchId) : undefined;
  }
  return req.employee.branchId as string;
}

router.get(
  '/dashboard',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);
    const where = branchId ? { branchId } : {};
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalBranches, openBranches, totalEmployees, totalCustomers, totalTables, totalItems, ordersToday, pending, preparing, ready, completed, paidBillsToday] =
      await Promise.all([
        prisma.branch.count(),
        prisma.branch.count({ where: { status: 'OPEN' } }),
        prisma.employee.count({ where: { ...where, status: 'ACTIVE' } }),
        prisma.customer.count(),
        prisma.restaurantTable.count({ where }),
        prisma.item.count({ where: { ...where, status: 'ACTIVE' } }),
        prisma.order.count({ where: { ...where, createdAt: { gte: todayStart } } }),
        prisma.order.count({ where: { ...where, status: 'PENDING' } }),
        prisma.order.count({ where: { ...where, status: 'PREPARING' } }),
        prisma.order.count({ where: { ...where, status: 'READY' } }),
        prisma.order.count({ where: { ...where, status: 'COMPLETED' } }),
        prisma.bill.findMany({
          where: {
            paymentStatus: 'PAID',
            createdAt: { gte: todayStart },
            ...(branchId
              ? {
                  tableSession: {
                    table: {
                      branchId,
                    },
                  },
                }
              : {}),
          },
          select: { total: true },
        }),
      ]);

    const salesToday = paidBillsToday.reduce((s: number, b: any) => s + Number(b.total), 0);

    res.json({
      totalBranches, openBranches, totalEmployees, totalCustomers, totalTables, totalItems,
      ordersToday, pending, preparing, ready, completed, salesToday,
    });
  })
);

router.get(
  '/sales',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;

    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const bills = await prisma.bill.findMany({
      where: {
        paymentStatus: 'PAID',

        createdAt: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        },

        tableSession: branchId
          ? {
              table: {
                branchId,
              },
            }
          : undefined,
      },

      select: {
        id: true,
        billNumber: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        paymentStatus: true,
        createdAt: true,
      },

      orderBy: {
        createdAt: 'desc',
      },

      take: 5000,
    });

    const grossSales = bills.reduce(
      (sum, bill) => sum + Number(bill.subtotal),
      0,
    );

    const totalDiscounts = bills.reduce(
      (sum, bill) => sum + Number(bill.discount),
      0,
    );

    const totalTax = bills.reduce(
      (sum, bill) => sum + Number(bill.tax),
      0,
    );

    const netSales = bills.reduce(
      (sum, bill) => sum + Number(bill.total),
      0,
    );

    const totalOrders = bills.length;

    const averageOrderValue =
      totalOrders > 0 ? netSales / totalOrders : 0;

    res.json({
      summary: {
        grossSales,
        totalDiscounts,
        totalTax,
        netSales,
        totalOrders,
        averageOrderValue,
      },
      bills,
    });
  }),
);

router.get(
  '/items',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          ...(branchId ? { branchId } : {}),
          createdAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
          status: {
            not: 'CANCELLED',
          },
        },
      },
      select: {
        itemId: true,
        nameSnapshot: true,
        quantity: true,
        priceSnapshot: true,
        order: {
          select: {
            createdAt: true,
            branchId: true,
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        item: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const itemMap = new Map<
      string,
      {
        itemId: string;
        name: string;
        categoryId: string | null;
        categoryName: string | null;
        quantitySold: number;
        revenue: number;
      }
    >();

    const categoryMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        quantitySold: number;
        revenue: number;
      }
    >();

    const branchMap = new Map<
      string,
      {
        branchId: string;
        branchName: string;
        quantitySold: number;
        revenue: number;
      }
    >();

    for (const row of orderItems) {
      const itemId = row.itemId;
      const quantity = row.quantity;
      const revenue = Number(row.priceSnapshot) * quantity;
      const categoryId = row.item?.category?.id ?? null;
      const categoryName = row.item?.category?.name ?? null;

      const existing = itemMap.get(itemId);

      if (existing) {
        existing.quantitySold += quantity;
        existing.revenue += revenue;
      } else {
        itemMap.set(itemId, {
          itemId,
          name: row.nameSnapshot,
          categoryId,
          categoryName,
          quantitySold: quantity,
          revenue,
        });
      }

      if (categoryId && categoryName) {
        const category = categoryMap.get(categoryId);

        if (category) {
          category.quantitySold += quantity;
          category.revenue += revenue;
        } else {
          categoryMap.set(categoryId, {
            categoryId,
            categoryName,
            quantitySold: quantity,
            revenue,
          });
        }
      }

      const branch = branchMap.get(row.order.branchId);

      if (branch) {
        branch.quantitySold += quantity;
        branch.revenue += revenue;
      } else {
        branchMap.set(row.order.branchId, {
          branchId: row.order.branchId,
          branchName: row.order.branch.name,
          quantitySold: quantity,
          revenue,
        });
      }
    }

    const items = Array.from(itemMap.values()).sort(
      (a, b) => b.quantitySold - a.quantitySold,
    );

    const bestSelling = [...items].sort(
      (a, b) => b.quantitySold - a.quantitySold,
    );

    const lowestSelling = [...items].sort(
      (a, b) => a.quantitySold - b.quantitySold,
    );

    const categoryPerformance = Array.from(categoryMap.values()).sort(
      (a, b) => b.revenue - a.revenue,
    );

    res.json({
      summary: {
        uniqueItemsSold: items.length,
        totalQuantitySold: items.reduce(
          (sum, item) => sum + item.quantitySold,
          0,
        ),
        totalItemRevenue: items.reduce(
          (sum, item) => sum + item.revenue,
          0,
        ),
      },
      bestSelling: bestSelling.slice(0, 20),
      lowestSelling: lowestSelling.slice(0, 20),
      items,
      categoryPerformance,
      branchPerformance: Array.from(branchMap.values()).sort(
        (a, b) => b.revenue - a.revenue,
      ),
    });
  }),
);

router.get(
  '/orders',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const orders = await prisma.order.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        createdAt: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        },
      },
     select: {
  id: true,
  orderNumber: true,
  type: true,
  status: true,
  subtotal: true,
  discountAmount: true,
  taxAmount: true,
  total: true,
  createdAt: true,
  branchId: true,
  branch: {
    select: {
      id: true,
      name: true,
    },
  },
},
      orderBy: {
        createdAt: 'desc',
      },
      take: 5000,
    });

    const totalOrders = orders.length;

    const completedOrders = orders.filter(
      (order) => order.status === 'COMPLETED',
    ).length;

    const cancelledOrders = orders.filter(
      (order) => order.status === 'CANCELLED',
    ).length;

    const pendingOrders = orders.filter(
      (order) => order.status === 'PENDING',
    ).length;

    const preparingOrders = orders.filter(
      (order) => order.status === 'PREPARING',
    ).length;

    const readyOrders = orders.filter(
      (order) => order.status === 'READY',
    ).length;

    const byType = orders.reduce<
      Record<string, { orderType: string; orders: number; revenue: number }>
    >((acc, order) => {
      const orderType = order.type;

      if (!acc[orderType]) {
        acc[orderType] = {
          orderType,
          orders: 0,
          revenue: 0,
        };
      }

      acc[orderType].orders += 1;
      acc[orderType].revenue += Number(order.total);

      return acc;
    }, {});

    const byDate = orders.reduce<
      Record<string, { date: string; orders: number; revenue: number }>
    >((acc, order) => {
      const date = order.createdAt.toISOString().slice(0, 10);

      if (!acc[date]) {
        acc[date] = {
          date,
          orders: 0,
          revenue: 0,
        };
      }

      acc[date].orders += 1;
      acc[date].revenue += Number(order.total);

      return acc;
    }, {});

    const byBranch = orders.reduce<
      Record<
        string,
        { branchId: string; branchName: string; orders: number; revenue: number }
      >
    >((acc, order) => {
      const key = order.branchId;

      if (!acc[key]) {
        acc[key] = {
          branchId: order.branchId,
          branchName: order.branch.name,
          orders: 0,
          revenue: 0,
        };
      }

      acc[key].orders += 1;
      acc[key].revenue += Number(order.total);
      return acc;
    }, {});

    res.json({
      summary: {
        totalOrders,
        completedOrders,
        cancelledOrders,
        pendingOrders,
        preparingOrders,
        readyOrders,
      },
      byType: Object.values(byType),
      byDate: Object.values(byDate).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      byBranch: Object.values(byBranch).sort(
        (a, b) => b.revenue - a.revenue,
      ),
      orders,
    });
  }),
);
router.get(
  '/payments',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const bills = await prisma.bill.findMany({
      where: {
        ...(branchId
          ? {
              tableSession: {
                table: {
                  branchId,
                },
              },
            }
          : {}),
        createdAt: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        },
      },
      select: {
        id: true,
        billNumber: true,
        total: true,
        paymentStatus: true,
        createdAt: true,
        payments: {
          select: {
            id: true,
            amount: true,
            method: true,
            recordedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5000,
    });

    const payments = bills.flatMap((bill) =>
      bill.payments.map((payment) => ({
        id: payment.id,
        billId: bill.id,
        billNumber: bill.billNumber,
        amount: Number(payment.amount),
        method: payment.method,
        paymentStatus: bill.paymentStatus,
        recordedAt: payment.recordedAt,
      })),
    );

    const totalCollected = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    const paidBills = bills.filter(
      (bill) => bill.paymentStatus === 'PAID',
    ).length;

    const unpaidBills = bills.filter(
      (bill) => bill.paymentStatus !== 'PAID',
    ).length;

    const byMethod = payments.reduce<
      Record<
        string,
        {
          method: string;
          payments: number;
          amount: number;
        }
      >
    >((acc, payment) => {
      const method = payment.method;

      if (!acc[method]) {
        acc[method] = {
          method,
          payments: 0,
          amount: 0,
        };
      }

      acc[method].payments += 1;
      acc[method].amount += payment.amount;

      return acc;
    }, {});

    const byDate = payments.reduce<
      Record<
        string,
        {
          date: string;
          payments: number;
          amount: number;
        }
      >
    >((acc, payment) => {
      const date = payment.recordedAt.toISOString().slice(0, 10);

      if (!acc[date]) {
        acc[date] = {
          date,
          payments: 0,
          amount: 0,
        };
      }

      acc[date].payments += 1;
      acc[date].amount += payment.amount;

      return acc;
    }, {});

    res.json({
      summary: {
        totalCollected,
        paidBills,
        unpaidBills,
        totalPayments: payments.length,
      },
      byMethod: Object.values(byMethod),
      byDate: Object.values(byDate).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      payments,
    });
  }),
);
router.get(
  '/tax',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const bills = await prisma.bill.findMany({
      where: {
        paymentStatus: 'PAID',
        ...(branchId
          ? {
              tableSession: {
                table: {
                  branchId,
                },
              },
            }
          : {}),
        createdAt: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        },
      },
      select: {
        id: true,
        billNumber: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        paymentStatus: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5000,
    });

    const taxableSales = bills.reduce(
      (sum, bill) => sum + Number(bill.subtotal) - Number(bill.discount),
      0,
    );

    const taxCollected = bills.reduce(
      (sum, bill) => sum + Number(bill.tax),
      0,
    );

    const totalSales = bills.reduce(
      (sum, bill) => sum + Number(bill.total),
      0,
    );

    const byDate = bills.reduce<
      Record<
        string,
        {
          date: string;
          taxableSales: number;
          taxCollected: number;
          totalSales: number;
        }
      >
    >((acc, bill) => {
      const date = bill.createdAt.toISOString().slice(0, 10);

      if (!acc[date]) {
        acc[date] = {
          date,
          taxableSales: 0,
          taxCollected: 0,
          totalSales: 0,
        };
      }

      acc[date].taxableSales +=
        Number(bill.subtotal) - Number(bill.discount);

      acc[date].taxCollected += Number(bill.tax);
      acc[date].totalSales += Number(bill.total);

      return acc;
    }, {});

    res.json({
      summary: {
        taxableSales,
        taxCollected,
        totalSales,
        billCount: bills.length,
      },
      byDate: Object.values(byDate).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      bills,
    });
  }),
);
router.get(
  '/discounts',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const bills = await prisma.bill.findMany({
      where: {
        paymentStatus: 'PAID',
        ...(branchId
          ? {
              tableSession: {
                table: {
                  branchId,
                },
              },
            }
          : {}),
        createdAt: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        },
      },
      select: {
        id: true,
        billNumber: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        paymentStatus: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5000,
    });

    const discountedBills = bills.filter(
      (bill) => Number(bill.discount) > 0,
    );

    const totalDiscounts = discountedBills.reduce(
      (sum, bill) => sum + Number(bill.discount),
      0,
    );

    const discountedSales = discountedBills.reduce(
      (sum, bill) => sum + Number(bill.total),
      0,
    );

    const originalSales = discountedBills.reduce(
      (sum, bill) => sum + Number(bill.subtotal),
      0,
    );

    const discountPercentage =
      originalSales > 0
        ? (totalDiscounts / originalSales) * 100
        : 0;

    const byDate = discountedBills.reduce<
      Record<
        string,
        {
          date: string;
          discountedBills: number;
          discountAmount: number;
          salesAfterDiscount: number;
        }
      >
    >((acc, bill) => {
      const date = bill.createdAt.toISOString().slice(0, 10);

      if (!acc[date]) {
        acc[date] = {
          date,
          discountedBills: 0,
          discountAmount: 0,
          salesAfterDiscount: 0,
        };
      }

      acc[date].discountedBills += 1;
      acc[date].discountAmount += Number(bill.discount);
      acc[date].salesAfterDiscount += Number(bill.total);

      return acc;
    }, {});

    res.json({
      summary: {
        totalDiscounts,
        discountedBills: discountedBills.length,
        discountedSales,
        originalSales,
        discountPercentage,
      },
      byDate: Object.values(byDate).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      bills: discountedBills,
    });
  }),
);
router.get(
  '/branches',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const selectedBranchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const branches = await prisma.branch.findMany({
      where: selectedBranchId
        ? { id: selectedBranchId }
        : {},
      select: {
        id: true,
        name: true,
        status: true,
        orders: {
          where: {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          },
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
            items: {
              select: {
                itemId: true,
                nameSnapshot: true,
                quantity: true,
                priceSnapshot: true,
              },
            },
          },
        },
        tables: {
          select: {
            sessions: {
              select: {
                bills: {
                  where: {
                    createdAt: {
                      ...(dateFrom ? { gte: dateFrom } : {}),
                      ...(dateTo ? { lte: dateTo } : {}),
                    },
                  },
                  select: {
                    paymentStatus: true,
                    payments: {
                      select: {
                        amount: true,
                        method: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const report = branches.map((branch) => {
      const orders = branch.orders;

      const totalOrders = orders.length;

      const completedOrders = orders.filter(
        (order) => order.status === 'COMPLETED',
      ).length;

      const cancelledOrders = orders.filter(
        (order) => order.status === 'CANCELLED',
      ).length;

      const revenue = orders
        .filter((order) => order.status !== 'CANCELLED')
        .reduce((sum, order) => sum + Number(order.total), 0);

      const itemMap = new Map<
        string,
        {
          itemId: string;
          name: string;
          quantity: number;
          revenue: number;
        }
      >();

      orders
        .filter((order) => order.status !== 'CANCELLED')
        .forEach((order) => {
          order.items.forEach((item) => {
            const key = item.itemId ?? item.nameSnapshot;

            const existing = itemMap.get(key);

            if (existing) {
              existing.quantity += item.quantity;
              existing.revenue +=
                Number(item.priceSnapshot) * item.quantity;
            } else {
              itemMap.set(key, {
                itemId: item.itemId ?? '',
                name: item.nameSnapshot,
                quantity: item.quantity,
                revenue:
                  Number(item.priceSnapshot) * item.quantity,
              });
            }
          });
        });

      const itemPerformance = Array.from(itemMap.values()).sort(
        (a, b) => b.revenue - a.revenue,
      );

      const paymentTotals = new Map<
        string,
        { method: string; amount: number; payments: number }
      >();

      for (const table of branch.tables) {
        for (const session of table.sessions) {
          for (const bill of session.bills) {
            for (const payment of bill.payments) {
              const existing = paymentTotals.get(payment.method);
              const amount = Number(payment.amount);

              if (existing) {
                existing.amount += amount;
                existing.payments += 1;
              } else {
                paymentTotals.set(payment.method, {
                  method: payment.method,
                  amount,
                  payments: 1,
                });
              }
            }
          }
        }
      }

      const totalCollected = Array.from(paymentTotals.values()).reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );

      return {
        branchId: branch.id,
        branchName: branch.name,
        status: branch.status,
        totalOrders,
        completedOrders,
        cancelledOrders,
        revenue,
        totalCollected,
        paymentTotals: Array.from(paymentTotals.values()).sort(
          (a, b) => b.amount - a.amount,
        ),
        itemPerformance,
      };
    });

    const totalOrders = report.reduce(
      (sum, branch) => sum + branch.totalOrders,
      0,
    );

    const totalRevenue = report.reduce(
      (sum, branch) => sum + branch.revenue,
      0,
    );

    res.json({
      summary: {
        branchCount: report.length,
        totalOrders,
        totalRevenue,
      },
      branches: report,
    });
  }),
);

router.get(
  '/employees',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const employees = await prisma.employee.findMany({
      where: branchId ? { branchId } : {},
      select: {
        id: true,
        fullName: true,
        role: true,
        department: true,
        status: true,
        branchId: true,

        ordersTaken: {
          where: {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          },
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
          },
        },

        kitchenOrders: {
          where: {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          },
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
          },
        },

        attendance: {
          where: {
            date: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          },
          select: {
            id: true,
            date: true,
            status: true,
            checkIn: true,
            checkOut: true,
            workingHours: true,
          },
        },

        leaves: {
          where:
            dateFrom || dateTo
              ? {
                  ...(dateTo
                    ? {
                        startDate: {
                          lte: dateTo,
                        },
                      }
                    : {}),
                  ...(dateFrom
                    ? {
                        endDate: {
                          gte: dateFrom,
                        },
                      }
                    : {}),
                }
              : undefined,
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            reason: true,
          },
        },
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    const report = employees.map((employee) => {
      const activeOrders = employee.ordersTaken.filter(
        (order) => order.status !== 'CANCELLED',
      );

      const activeKitchenOrders = employee.kitchenOrders.filter(
        (order) => order.status !== 'CANCELLED',
      );

      const ordersHandled = activeOrders.length;

      const salesHandled = activeOrders.reduce(
        (sum, order) => sum + Number(order.total),
        0,
      );

      const kitchenSalesHandled = activeKitchenOrders.reduce(
        (sum, order) => sum + Number(order.total),
        0,
      );

      const attendanceSummary = employee.attendance.reduce<
        Record<string, number>
      >((acc, record) => {
        acc[record.status] = (acc[record.status] ?? 0) + 1;
        return acc;
      }, {});

      const leaveSummary = employee.leaves.reduce<
        Record<string, number>
      >((acc, leave) => {
        acc[leave.status] = (acc[leave.status] ?? 0) + 1;
        return acc;
      }, {});

      const workingHours = employee.attendance.reduce(
        (sum, record) => sum + Number(record.workingHours ?? 0),
        0,
      );

      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        role: employee.role,
        department: employee.department,
        status: employee.status,
        branchId: employee.branchId,
        ordersHandled,
        salesHandled,
        attendanceSummary,
        leaveSummary,
        activity: {
          serviceOrdersHandled: activeOrders.length,
          kitchenOrdersHandled: activeKitchenOrders.length,
          totalOrdersHandled:
            activeOrders.length + activeKitchenOrders.length,
          kitchenSalesHandled,
          attendanceRecords: employee.attendance.length,
          workingHours,
          leaveRecords: employee.leaves.length,
        },
      };
    });

    res.json({
      summary: {
        employeeCount: report.length,
        totalOrdersHandled: report.reduce(
          (sum, employee) => sum + employee.ordersHandled,
          0,
        ),
        totalSalesHandled: report.reduce(
          (sum, employee) => sum + employee.salesHandled,
          0,
        ),
        totalKitchenOrdersHandled: report.reduce(
          (sum, employee) =>
            sum + employee.activity.kitchenOrdersHandled,
          0,
        ),
      },
      employees: report,
    });
  }),
);

router.get(
  '/inventory',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const inventoryItems = await prisma.inventoryItem.findMany({
      where: branchId ? { branchId } : {},
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        reorderLevel: true,
        status: true,
        branchId: true,
        stocks: {
          select: {
            quantity: true,
            averageCost: true,
            updatedAt: true,
          },
        },
        movements: {
          where: {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          },
          select: {
            id: true,
            type: true,
            quantity: true,
            unitCost: true,
            referenceType: true,
            referenceId: true,
            notes: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 5000,
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const items = inventoryItems.map((item) => {
      const stock = item.stocks[0];
      const quantity = Number(stock?.quantity ?? 0);
      const averageCost = Number(stock?.averageCost ?? 0);
      const reorderLevel = Number(item.reorderLevel);

      const movementSummary = item.movements.reduce<
        Record<string, number>
      >((acc, movement) => {
        acc[movement.type] =
          (acc[movement.type] ?? 0) + Number(movement.quantity);
        return acc;
      }, {});

      return {
        inventoryItemId: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        status: item.status,
        branchId: item.branchId,
        currentQuantity: quantity,
        reorderLevel,
        averageCost,
        currentStockValue: quantity * averageCost,
        lowStock: quantity <= reorderLevel,
        movementSummary,
        movements: item.movements,
      };
    });

    const lowStock = items.filter((item) => item.lowStock);

    const movementTotals = items.reduce<
      Record<string, number>
    >((acc, item) => {
      for (const [type, quantity] of Object.entries(
        item.movementSummary,
      )) {
        acc[type] = (acc[type] ?? 0) + quantity;
      }
      return acc;
    }, {});

    res.json({
      summary: {
        inventoryItemCount: items.length,
        lowStockCount: lowStock.length,
        totalCurrentStockValue: items.reduce(
          (sum, item) => sum + item.currentStockValue,
          0,
        ),
        movementTotals,
      },
      items,
      lowStock,
    });
  }),
);

router.get(
  '/expenses',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const expenses = await prisma.expense.findMany({
      where: {
        status: 'ACTIVE',
        ...(branchId ? { branchId } : {}),
        expenseDate: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        },
      },
      select: {
        id: true,
        branchId: true,
        category: true,
        amount: true,
        expenseDate: true,
        paymentMethod: true,
        description: true,
        receiptUrl: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        expenseDate: 'desc',
      },
      take: 5000,
    });

    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0,
    );

    const byCategory = expenses.reduce<
      Record<
        string,
        { category: string; expenses: number; amount: number }
      >
    >((acc, expense) => {
      if (!acc[expense.category]) {
        acc[expense.category] = {
          category: expense.category,
          expenses: 0,
          amount: 0,
        };
      }

      acc[expense.category].expenses += 1;
      acc[expense.category].amount += Number(expense.amount);
      return acc;
    }, {});

    const byPaymentMethod = expenses.reduce<
      Record<
        string,
        { paymentMethod: string; expenses: number; amount: number }
      >
    >((acc, expense) => {
      const method = expense.paymentMethod;

      if (!acc[method]) {
        acc[method] = {
          paymentMethod: method,
          expenses: 0,
          amount: 0,
        };
      }

      acc[method].expenses += 1;
      acc[method].amount += Number(expense.amount);
      return acc;
    }, {});

    const byDate = expenses.reduce<
      Record<string, { date: string; expenses: number; amount: number }>
    >((acc, expense) => {
      const date = expense.expenseDate.toISOString().slice(0, 10);

      if (!acc[date]) {
        acc[date] = {
          date,
          expenses: 0,
          amount: 0,
        };
      }

      acc[date].expenses += 1;
      acc[date].amount += Number(expense.amount);
      return acc;
    }, {});

    const byBranch = expenses.reduce<
      Record<
        string,
        { branchId: string; expenses: number; amount: number }
      >
    >((acc, expense) => {
      if (!acc[expense.branchId]) {
        acc[expense.branchId] = {
          branchId: expense.branchId,
          expenses: 0,
          amount: 0,
        };
      }

      acc[expense.branchId].expenses += 1;
      acc[expense.branchId].amount += Number(expense.amount);
      return acc;
    }, {});

    res.json({
      summary: {
        totalExpenses,
        expenseCount: expenses.length,
      },
      byCategory: Object.values(byCategory).sort(
        (a, b) => b.amount - a.amount,
      ),
      byPaymentMethod: Object.values(byPaymentMethod).sort(
        (a, b) => b.amount - a.amount,
      ),
      byDate: Object.values(byDate).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      byBranch: Object.values(byBranch).sort(
        (a, b) => b.amount - a.amount,
      ),
      expenses,
    });
  }),
);

router.get(
  '/purchases',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const purchases = await prisma.purchase.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        purchaseDate: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        },
      },
      select: {
        id: true,
        purchaseNumber: true,
        invoiceNumber: true,
        purchaseDate: true,
        status: true,
        subtotal: true,
        tax: true,
        total: true,
        branchId: true,
        supplierId: true,
        notes: true,
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            unitCost: true,
            totalCost: true,
            inventoryItemId: true,
            inventoryItem: {
              select: {
                id: true,
                name: true,
                unit: true,
              },
            },
          },
        },
      },
      orderBy: {
        purchaseDate: 'desc',
      },
      take: 5000,
    });

    const receivedPurchases = purchases.filter(
      (purchase) => purchase.status === 'RECEIVED',
    );

    const totalPurchases = receivedPurchases.reduce(
      (sum, purchase) => sum + Number(purchase.total),
      0,
    );

    const byDate = receivedPurchases.reduce<
      Record<string, { date: string; purchases: number; amount: number }>
    >((acc, purchase) => {
      const date = purchase.purchaseDate.toISOString().slice(0, 10);

      if (!acc[date]) {
        acc[date] = {
          date,
          purchases: 0,
          amount: 0,
        };
      }

      acc[date].purchases += 1;
      acc[date].amount += Number(purchase.total);
      return acc;
    }, {});

    res.json({
      summary: {
        purchaseCount: purchases.length,
        receivedPurchaseCount: receivedPurchases.length,
        totalPurchases,
      },
      byDate: Object.values(byDate).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      purchases,
    });
  }),
);

router.get(
  '/financial',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const branchId = branchFilterFor(req);

    const from = req.query.from
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.from)
      : undefined;

    const to = req.query.to
      ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.to)
      : undefined;

    const dateFrom = from ? new Date(`${from}T00:00:00`) : undefined;
    const dateTo = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const [bills, expenses, purchases, payroll] = await Promise.all([
      prisma.bill.findMany({
        where: {
          paymentStatus: 'PAID',
          ...(branchId
            ? {
                tableSession: {
                  table: {
                    branchId,
                  },
                },
              }
            : {}),
          createdAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        },
        select: {
          subtotal: true,
          discount: true,
          tax: true,
          total: true,
        },
      }),

      prisma.expense.findMany({
        where: {
          status: 'ACTIVE',
          ...(branchId ? { branchId } : {}),
          expenseDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        },
        select: {
          amount: true,
        },
      }),

      prisma.purchase.findMany({
        where: {
          status: 'RECEIVED',
          ...(branchId ? { branchId } : {}),
          purchaseDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        },
        select: {
          total: true,
        },
      }),

      prisma.payrollRecord.findMany({
        where: {
          ...(branchId ? { branchId } : {}),
          payrollMonth: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
          status: {
            in: ['CALCULATED', 'REVIEWED', 'APPROVED', 'LOCKED'],
          },
        },
        select: {
          netSalary: true,
        },
      }),
    ]);

    const netSales = bills.reduce(
      (sum, bill) => sum + Number(bill.total),
      0,
    );

    const totalTax = bills.reduce(
      (sum, bill) => sum + Number(bill.tax),
      0,
    );

    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0,
    );

    const totalPurchases = purchases.reduce(
      (sum, purchase) => sum + Number(purchase.total),
      0,
    );

    const totalPayroll = payroll.reduce(
      (sum, record) => sum + Number(record.netSalary),
      0,
    );

    const recordedCosts =
      totalExpenses + totalPurchases + totalPayroll;

    res.json({
      summary: {
        netSales,
        totalTax,
        totalExpenses,
        totalPurchases,
        totalPayroll,
        recordedCosts,
        netAfterRecordedCosts: netSales - recordedCosts,
      },
      coverage: {
        sales: 'Paid bills',
        expenses: 'Active expense records',
        purchases: 'Received purchase records',
        payroll: 'Calculated/reviewed/approved/locked payroll records',
        note:
          'Net after recorded costs is a financial calculation from the available records; it is not a full accounting profit figure unless all business costs are recorded in this system.',
      },
    });
  }),
);

export default router;
