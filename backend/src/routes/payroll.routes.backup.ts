import { Router } from 'express';
import { z } from 'zod';
import { Prisma, Role } from '@prisma/client';

import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { logAudit } from '../services/audit.service';
import { AppError } from '../utils/errors';

const router = Router();

const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'MANAGER'] as const;

/*
|--------------------------------------------------------------------------
| VALIDATION
|--------------------------------------------------------------------------
*/

const branchQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
});

const employeeIdSchema = z.object({
  employeeId: z.string().uuid(),
});

const salaryStructureIdSchema = z.object({
  id: z.string().uuid(),
});

const salaryStructureSchema = z.object({
  employeeId: z.string().uuid(),

  basicSalary: z.coerce.number().nonnegative(),
  allowances: z.coerce.number().nonnegative().default(0),
  overtimeRate: z.coerce.number().nonnegative().default(0),
  deductions: z.coerce.number().nonnegative().default(0),

  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional().nullable(),

  isActive: z.boolean().default(true),
});

const updateSalaryStructureSchema = z.object({
  basicSalary: z.coerce.number().nonnegative().optional(),
  allowances: z.coerce.number().nonnegative().optional(),
  overtimeRate: z.coerce.number().nonnegative().optional(),
  deductions: z.coerce.number().nonnegative().optional(),

  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional().nullable(),

  isActive: z.boolean().optional(),
});

const statusSchema = z.object({
  isActive: z.boolean(),
});

const calculatePayrollSchema = z.object({
  branchId: z.string().uuid(),
  payrollMonth: z.string(),
});

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function ensureCanAccessEmployee(
  currentEmployee: {
    role: string;
    branchId: string | null;
  },
  targetEmployee: {
    branchId: string | null;
  },
) {
  if (
    currentEmployee.role === 'MANAGER' &&
    targetEmployee.branchId !== currentEmployee.branchId
  ) {
    throw new AppError(
      'Managers can only manage payroll for employees at their own branch.',
      403,
    );
  }
}

async function getEmployeeOrThrow(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: {
      id: employeeId,
    },

    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      department: true,
      status: true,
      joiningDate: true,
      branchId: true,

      branch: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  if (!employee) {
    throw new AppError('Employee not found.', 404);
  }

  return employee;
}

/*
|--------------------------------------------------------------------------
| GET PAYROLL EMPLOYEES
|--------------------------------------------------------------------------
|
| GET /api/payroll/employees
|
*/

router.get(
  '/employees',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const query = branchQuerySchema.parse(req.query);

    let branchId: string | undefined;

    if (req.employee!.role === 'SUPER_ADMIN') {
      branchId = query.branchId;
    } else {
      if (!req.employee!.branchId) {
        throw new AppError(
          'You are not assigned to a branch.',
          403,
        );
      }

      branchId = req.employee!.branchId;

      if (
        query.branchId &&
        query.branchId !== req.employee!.branchId
      ) {
        throw new AppError(
          'Managers can only access payroll for their own branch.',
          403,
        );
      }
    }

    const employees = await prisma.employee.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        status: 'ACTIVE',
      },

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
        branchId: true,

        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },

      orderBy: {
        fullName: 'asc',
      },
    });

    res.json({
      employees,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| CREATE SALARY STRUCTURE
|--------------------------------------------------------------------------
|
| POST /api/payroll/salary-structures
|
*/

router.post(
  '/salary-structures',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const data = salaryStructureSchema.parse(req.body);

    const targetEmployee = await getEmployeeOrThrow(
      data.employeeId,
    );

    ensureCanAccessEmployee(
      req.employee!,
      targetEmployee,
    );

    if (targetEmployee.status !== 'ACTIVE') {
      throw new AppError(
        'Salary structure cannot be created for an inactive employee.',
        400,
      );
    }

    if (
      data.effectiveTo &&
      data.effectiveTo < data.effectiveFrom
    ) {
      throw new AppError(
        'Effective-to date cannot be earlier than effective-from date.',
        400,
      );
    }

    if (data.isActive) {
      await prisma.salaryStructure.updateMany({
        where: {
          employeeId: targetEmployee.id,
          isActive: true,
        },

        data: {
          isActive: false,
        },
      });
    }

    const salaryStructure =
      await prisma.salaryStructure.create({
        data: {
          employeeId: targetEmployee.id,
          basicSalary: data.basicSalary,
          allowances: data.allowances,
          overtimeRate: data.overtimeRate,
          deductions: data.deductions,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo ?? null,
          isActive: data.isActive,
        },

        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              role: true,
              branchId: true,
            },
          },
        },
      });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'CREATE_SALARY_STRUCTURE',
      entity: 'SalaryStructure',
      entityId: salaryStructure.id,

      metadata: {
        employeeId: targetEmployee.id,
        branchId: targetEmployee.branchId,
        basicSalary: data.basicSalary,
        allowances: data.allowances,
        overtimeRate: data.overtimeRate,
        deductions: data.deductions,
        effectiveFrom:
          data.effectiveFrom.toISOString(),
        effectiveTo:
          data.effectiveTo?.toISOString() ?? null,
      },
    });

    res.status(201).json({
      message: 'Salary structure created successfully.',
      salaryStructure,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| GET SALARY STRUCTURES
|--------------------------------------------------------------------------
|
| GET /api/payroll/salary-structures/:employeeId
|
*/

router.get(
  '/salary-structures/:employeeId',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const { employeeId } =
      employeeIdSchema.parse(req.params);

    const targetEmployee =
      await getEmployeeOrThrow(employeeId);

    ensureCanAccessEmployee(
      req.employee!,
      targetEmployee,
    );

    const salaryStructures =
      await prisma.salaryStructure.findMany({
        where: {
          employeeId,
        },

        orderBy: [
          {
            isActive: 'desc',
          },
          {
            effectiveFrom: 'desc',
          },
        ],
      });

    res.json({
      employee: targetEmployee,
      salaryStructures,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| UPDATE SALARY STRUCTURE
|--------------------------------------------------------------------------
|
| PUT /api/payroll/salary-structures/:id
|
*/

router.put(
  '/salary-structures/:id',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const { id } =
      salaryStructureIdSchema.parse(req.params);

    const data =
      updateSalaryStructureSchema.parse(req.body);

    const existing =
      await prisma.salaryStructure.findUnique({
        where: {
          id,
        },

        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              role: true,
              status: true,
              branchId: true,
            },
          },
        },
      });

    if (!existing) {
      throw new AppError(
        'Salary structure not found.',
        404,
      );
    }

    ensureCanAccessEmployee(
      req.employee!,
      existing.employee,
    );

    const effectiveFrom =
      data.effectiveFrom ??
      existing.effectiveFrom;

    const effectiveTo =
      data.effectiveTo !== undefined
        ? data.effectiveTo
        : existing.effectiveTo;

    if (
      effectiveTo &&
      effectiveTo < effectiveFrom
    ) {
      throw new AppError(
        'Effective-to date cannot be earlier than effective-from date.',
        400,
      );
    }

    if (
      data.isActive === true &&
      !existing.isActive
    ) {
      await prisma.salaryStructure.updateMany({
        where: {
          employeeId: existing.employeeId,
          isActive: true,
          NOT: {
            id,
          },
        },

        data: {
          isActive: false,
        },
      });
    }

    const salaryStructure =
      await prisma.salaryStructure.update({
        where: {
          id,
        },

        data: {
          ...(data.basicSalary !== undefined && {
            basicSalary: data.basicSalary,
          }),

          ...(data.allowances !== undefined && {
            allowances: data.allowances,
          }),

          ...(data.overtimeRate !== undefined && {
            overtimeRate: data.overtimeRate,
          }),

          ...(data.deductions !== undefined && {
            deductions: data.deductions,
          }),

          ...(data.effectiveFrom !== undefined && {
            effectiveFrom: data.effectiveFrom,
          }),

          ...(data.effectiveTo !== undefined && {
            effectiveTo: data.effectiveTo,
          }),

          ...(data.isActive !== undefined && {
            isActive: data.isActive,
          }),
        },

        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              role: true,
              branchId: true,
            },
          },
        },
      });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'UPDATE_SALARY_STRUCTURE',
      entity: 'SalaryStructure',
      entityId: salaryStructure.id,

      metadata: {
        employeeId: existing.employeeId,
        changedFields: Object.keys(data),
      },
    });

    res.json({
      message: 'Salary structure updated successfully.',
      salaryStructure,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| ACTIVATE / DEACTIVATE SALARY STRUCTURE
|--------------------------------------------------------------------------
|
| PATCH /api/payroll/salary-structures/:id/status
|
*/

router.patch(
  '/salary-structures/:id/status',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const { id } =
      salaryStructureIdSchema.parse(req.params);

    const { isActive } =
      statusSchema.parse(req.body);

    const existing =
      await prisma.salaryStructure.findUnique({
        where: {
          id,
        },

        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              role: true,
              branchId: true,
            },
          },
        },
      });

    if (!existing) {
      throw new AppError(
        'Salary structure not found.',
        404,
      );
    }

    ensureCanAccessEmployee(
      req.employee!,
      existing.employee,
    );

    if (isActive) {
      await prisma.salaryStructure.updateMany({
        where: {
          employeeId: existing.employeeId,
          isActive: true,
          NOT: {
            id,
          },
        },

        data: {
          isActive: false,
        },
      });
    }

    const salaryStructure =
      await prisma.salaryStructure.update({
        where: {
          id,
        },

        data: {
          isActive,
        },
      });

    await logAudit({
      userId: req.employee!.employeeId,

      action: isActive
        ? 'ACTIVATE_SALARY_STRUCTURE'
        : 'DEACTIVATE_SALARY_STRUCTURE',

      entity: 'SalaryStructure',
      entityId: salaryStructure.id,

      metadata: {
        employeeId: existing.employeeId,
        isActive,
      },
    });

    res.json({
      message: isActive
        ? 'Salary structure activated successfully.'
        : 'Salary structure deactivated successfully.',

      salaryStructure,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| CALCULATE MONTHLY PAYROLL
|--------------------------------------------------------------------------
|
| POST /api/payroll/calculate
|
| Body:
|
| {
|   "branchId": "branch-uuid",
|   "payrollMonth": "2026-09-01"
| }
|
| Rules:
| - SUPER_ADMIN can calculate any branch.
| - MANAGER can calculate only their own branch.
| - Only ACTIVE employees are processed.
| - Salary structure is selected using effective dates.
| - Approved leave is currently treated as PAID leave.
| - Money calculations use Prisma.Decimal.
| - REVIEWED / APPROVED / LOCKED payroll cannot be recalculated.
|
*/

router.post(
  '/calculate',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const data =
      calculatePayrollSchema.parse(req.body);

    /*
     * ----------------------------------------------------------
     * BRANCH AUTHORIZATION
     * ----------------------------------------------------------
     */

    if (
      req.employee!.role !== 'SUPER_ADMIN' &&
      req.employee!.branchId !== data.branchId
    ) {
      throw new AppError(
        'Managers can only calculate payroll for their own branch.',
        403,
      );
    }

    /*
     * ----------------------------------------------------------
     * PAYROLL MONTH
     * ----------------------------------------------------------
     */

    const payrollMonth = new Date(
      `${data.payrollMonth}T00:00:00.000Z`,
    );

    if (Number.isNaN(payrollMonth.getTime())) {
      throw new AppError(
        'Invalid payroll month.',
        400,
      );
    }

    if (
      payrollMonth.getUTCDate() !== 1
    ) {
      throw new AppError(
        'payrollMonth must be the first day of the month, for example 2026-09-01.',
        400,
      );
    }

    const nextMonth = new Date(
      Date.UTC(
        payrollMonth.getUTCFullYear(),
        payrollMonth.getUTCMonth() + 1,
        1,
      ),
    );

    /*
     * ----------------------------------------------------------
     * VERIFY BRANCH
     * ----------------------------------------------------------
     */

    const branch =
      await prisma.branch.findUnique({
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
      throw new AppError(
        'Selected branch does not exist.',
        404,
      );
    }

    /*
     * ----------------------------------------------------------
     * LOAD ACTIVE EMPLOYEES
     * ----------------------------------------------------------
     */

    const employees =
      await prisma.employee.findMany({
        where: {
          branchId: data.branchId,
          status: 'ACTIVE',
        },

        select: {
          id: true,
          fullName: true,
          role: true,
          branchId: true,
        },

        orderBy: {
          fullName: 'asc',
        },
      });

    if (employees.length === 0) {
      throw new AppError(
        'No active employees found for this branch.',
        400,
      );
    }

    const payrollResults = [];

    /*
     * ----------------------------------------------------------
     * PROCESS EMPLOYEES
     * ----------------------------------------------------------
     */

    for (const employee of employees) {
      /*
       * --------------------------------------------------------
       * FIND SALARY STRUCTURE
       * --------------------------------------------------------
       *
       * We use effective dates so historical payroll uses
       * the correct salary structure for that month.
       */

      const salaryStructure =
        await prisma.salaryStructure.findFirst({
          where: {
            employeeId: employee.id,

            effectiveFrom: {
              lte: payrollMonth,
            },

            OR: [
              {
                effectiveTo: null,
              },
              {
                effectiveTo: {
                  gte: payrollMonth,
                },
              },
            ],
          },

          orderBy: {
            effectiveFrom: 'desc',
          },
        });

      if (!salaryStructure) {
        throw new AppError(
          `No salary structure found for employee ${employee.fullName}.`,
          400,
        );
      }

      /*
       * --------------------------------------------------------
       * LOAD ATTENDANCE
       * --------------------------------------------------------
       */

      const attendance =
        await prisma.attendance.findMany({
          where: {
            employeeId: employee.id,
            branchId: data.branchId,

            date: {
              gte: payrollMonth,
              lt: nextMonth,
            },
          },

          orderBy: {
            date: 'asc',
          },
        });

      /*
       * --------------------------------------------------------
       * LOAD APPROVED LEAVE
       * --------------------------------------------------------
       */

      const approvedLeaves =
        await prisma.leave.findMany({
          where: {
            employeeId: employee.id,
            branchId: data.branchId,
            status: 'APPROVED',

            startDate: {
              lt: nextMonth,
            },

            endDate: {
              gte: payrollMonth,
            },
          },

          orderBy: {
            startDate: 'asc',
          },
        });

      /*
       * --------------------------------------------------------
       * ATTENDANCE COUNTS
       * --------------------------------------------------------
       */

      let presentDays = 0;
      let absentDays = 0;
      let leaveDays = 0;
      let halfDays = 0;
      let overtimeHours = 0;

      /*
       * A recorded attendance day is treated as a working day.
       *
       * This avoids assuming every calendar day is a working
       * day because restaurants may have weekly holidays.
       */

      const workingDays =
        attendance.length;

      for (const record of attendance) {
        switch (record.status) {
          case 'PRESENT':
          case 'LATE':
            presentDays += 1;
            break;

          case 'ABSENT':
            absentDays += 1;
            break;

          case 'HALF_DAY':
            halfDays += 1;
            presentDays += 0.5;
            break;

          case 'LEAVE':
            /*
             * Approved leave is currently paid leave.
             */
            leaveDays += 1;
            break;

          default:
            break;
        }

        /*
         * Standard working day = 8 hours.
         *
         * Hours above 8 become overtime.
         */

        if (
          record.workingHours !== null &&
          record.workingHours !== undefined
        ) {
          const hours =
            Number(record.workingHours);

          if (hours > 8) {
            overtimeHours += hours - 8;
          }
        }
      }

      /*
       * --------------------------------------------------------
       * APPROVED LEAVE DAYS
       * --------------------------------------------------------
       *
       * Approved leave is paid.
       *
       * Avoid double-counting days already marked LEAVE
       * in Attendance.
       */

      for (const leave of approvedLeaves) {
        const leaveStart =
          leave.startDate < payrollMonth
            ? payrollMonth
            : leave.startDate;

        const leaveEnd =
          leave.endDate >= nextMonth
            ? new Date(
                nextMonth.getTime() -
                  24 * 60 * 60 * 1000,
              )
            : leave.endDate;

        const diff =
          leaveEnd.getTime() -
          leaveStart.getTime();

        const days =
          Math.floor(
            diff /
              (24 * 60 * 60 * 1000),
          ) + 1;

        const attendanceLeaveDays =
          attendance.filter(
            (record) =>
              record.status === 'LEAVE' &&
              record.date >= leaveStart &&
              record.date <= leaveEnd,
          ).length;

        leaveDays += Math.max(
          0,
          days - attendanceLeaveDays,
        );
      }

      /*
       * --------------------------------------------------------
       * MONEY CALCULATION
       * --------------------------------------------------------
       */

      const basicSalary =
        new Prisma.Decimal(
          salaryStructure.basicSalary,
        );

      const allowances =
        new Prisma.Decimal(
          salaryStructure.allowances,
        );

      const overtimeRate =
        new Prisma.Decimal(
          salaryStructure.overtimeRate,
        );

      const fixedDeductions =
        new Prisma.Decimal(
          salaryStructure.deductions,
        );

      /*
       * Overtime amount
       */

      const overtimeAmount =
        overtimeRate.mul(
          new Prisma.Decimal(
            overtimeHours.toFixed(2),
          ),
        );

      /*
       * Gross salary
       *
       * Basic + Allowances + Overtime
       */

      const grossSalary =
        basicSalary
          .add(allowances)
          .add(overtimeAmount);

      /*
       * Absence deduction
       *
       * Basic salary / working days × absent days
       */

      let absenceDeduction =
        new Prisma.Decimal(0);

      if (
        workingDays > 0 &&
        absentDays > 0
      ) {
        const dailySalary =
          basicSalary.div(
            new Prisma.Decimal(
              workingDays,
            ),
          );

        absenceDeduction =
          dailySalary.mul(
            new Prisma.Decimal(
              absentDays,
            ),
          );
      }

      /*
       * Half-day deduction
       *
       * Half of one daily basic salary.
       */

      if (
        workingDays > 0 &&
        halfDays > 0
      ) {
        const dailySalary =
          basicSalary.div(
            new Prisma.Decimal(
              workingDays,
            ),
          );

        const halfDayDeduction =
          dailySalary
            .mul(
              new Prisma.Decimal(
                halfDays,
              ),
            )
            .mul(
              new Prisma.Decimal(
                '0.5',
              ),
            );

        absenceDeduction =
          absenceDeduction.add(
            halfDayDeduction,
          );
      }

      /*
       * Total deductions
       */

      const totalDeductions =
        absenceDeduction.add(
          fixedDeductions,
        );

      /*
       * Net salary
       */

      const netSalary =
        grossSalary.sub(
          totalDeductions,
        );

      /*
       * --------------------------------------------------------
       * EXISTING PAYROLL RECORD
       * --------------------------------------------------------
       */

      const existingPayroll =
        await prisma.payrollRecord.findUnique({
          where: {
            employeeId_payrollMonth: {
              employeeId: employee.id,
              payrollMonth,
            },
          },
        });

      /*
       * Do not recalculate payroll that has already been
       * reviewed, approved, or locked.
       */

      if (
        existingPayroll &&
        [
          'REVIEWED',
          'APPROVED',
          'LOCKED',
        ].includes(
          existingPayroll.status,
        )
      ) {
        throw new AppError(
          `Payroll for ${employee.fullName} is already ${existingPayroll.status} and cannot be recalculated.`,
          409,
        );
      }

      /*
       * --------------------------------------------------------
       * UPDATE EXISTING PAYROLL
       * --------------------------------------------------------
       */

      const payrollRecord =
        existingPayroll
          ? await prisma.payrollRecord.update({
              where: {
                id: existingPayroll.id,
              },

              data: {
                basicSalary,
                allowances,
                overtimeAmount,
                grossSalary,
                absenceDeduction,

                otherDeductions:
                  fixedDeductions,

                totalDeductions,
                netSalary,

                workingDays,

                presentDays:
                  new Prisma.Decimal(
                    presentDays.toFixed(2),
                  ),

                absentDays:
                  new Prisma.Decimal(
                    absentDays.toFixed(2),
                  ),

                leaveDays:
                  new Prisma.Decimal(
                    leaveDays.toFixed(2),
                  ),

                halfDays:
                  new Prisma.Decimal(
                    halfDays.toFixed(2),
                  ),

                overtimeHours:
                  new Prisma.Decimal(
                    overtimeHours.toFixed(2),
                  ),

                status: 'CALCULATED',
                calculatedAt: new Date(),
              },

              include: {
                employee: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    branchId: true,
                  },
                },
              },
            })

          /*
           * ----------------------------------------------------
           * CREATE NEW PAYROLL
           * ----------------------------------------------------
           */

          : await prisma.payrollRecord.create({
              data: {
                employeeId: employee.id,
                branchId: data.branchId,
                payrollMonth,

                basicSalary,
                allowances,
                overtimeAmount,
                grossSalary,

                absenceDeduction,

                otherDeductions:
                  fixedDeductions,

                totalDeductions,
                netSalary,

                workingDays,

                presentDays:
                  new Prisma.Decimal(
                    presentDays.toFixed(2),
                  ),

                absentDays:
                  new Prisma.Decimal(
                    absentDays.toFixed(2),
                  ),

                leaveDays:
                  new Prisma.Decimal(
                    leaveDays.toFixed(2),
                  ),

                halfDays:
                  new Prisma.Decimal(
                    halfDays.toFixed(2),
                  ),

                overtimeHours:
                  new Prisma.Decimal(
                    overtimeHours.toFixed(2),
                  ),

                status: 'CALCULATED',
                calculatedAt: new Date(),
              },

              include: {
                employee: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    branchId: true,
                  },
                },
              },
            });

      payrollResults.push(
        payrollRecord,
      );
    }

    /*
     * ----------------------------------------------------------
     * AUDIT LOG
     * ----------------------------------------------------------
     */

    await logAudit({
      userId: req.employee!.employeeId,

      action: 'CALCULATE_PAYROLL',

      entity: 'PayrollRecord',

      entityId: data.branchId,

      metadata: {
        branchId: data.branchId,
        payrollMonth:
          data.payrollMonth,
        employeeCount:
          payrollResults.length,
      },
    });

    /*
     * ----------------------------------------------------------
     * RESPONSE
     * ----------------------------------------------------------
     */

    res.status(200).json({
      message:
        'Payroll calculated successfully.',

      branch,

      payrollMonth:
        data.payrollMonth,

      employeeCount:
        payrollResults.length,

      payrollRecords:
        payrollResults,
    });
  }),
);

export default router;