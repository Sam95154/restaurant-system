import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { hashPassword } from '../utils/password';
import { logAudit } from '../services/audit.service';
import { AppError } from '../utils/errors';

const router = Router();

const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'MANAGER'] as const;

const EMPLOYEE_ROLES = [
  'MANAGER',
  'SERVICE_EMPLOYEE',
  'KITCHEN_EMPLOYEE',
  'BILLING_EMPLOYEE',
] as const;

const employeeIdSchema = z.object({
  id: z.string().uuid(),
});

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().min(7).max(20).optional().or(z.literal('')),
  loginId: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(100),
  role: z.enum(EMPLOYEE_ROLES),
  branchId: z.string().uuid(),
  department: z.string().trim().max(100).optional().or(z.literal('')),
  joiningDate: z.coerce.date().optional(),
});

const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().min(7).max(20).optional().or(z.literal('')),
  department: z.string().trim().max(100).optional().or(z.literal('')),
  joiningDate: z.coerce.date().optional(),
});

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

const roleSchema = z.object({
  role: z.enum(EMPLOYEE_ROLES),
});

const branchSchema = z.object({
  branchId: z.string().uuid(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(100),
});

function normalizeOptional(value?: string) {
  if (value === undefined || value === '') {
    return undefined;
  }

  return value;
}

async function getEmployeeOrThrow(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      branch: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      managesBranch: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      permissions: {
        include: {
          permission: true,
        },
      },
      _count: {
        select: {
          ordersTaken: true,
          kitchenOrders: true,
        },
      },
    },
  });

  if (!employee) {
    throw new AppError('Employee not found.', 404);
  }

  return employee;
}

function ensureManagerCanAccessEmployee(
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
      'Managers can only manage employees at their own branch.',
      403,
    );
  }
}

function ensureManagerCanManageTarget(
  currentEmployee: {
    role: string;
  },
  targetEmployee: {
    role: string;
  },
) {
  if (
    currentEmployee.role === 'MANAGER' &&
    targetEmployee.role === 'MANAGER'
  ) {
    throw new AppError(
      'Managers cannot modify another manager.',
      403,
    );
  }
}

/*
|--------------------------------------------------------------------------
| CREATE EMPLOYEE
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const data = createEmployeeSchema.parse(req.body);

    if (
      req.employee!.role === 'MANAGER' &&
      data.branchId !== req.employee!.branchId
    ) {
      throw new AppError(
        'Managers can only create employees for their own branch.',
        403,
      );
    }

    if (
      req.employee!.role === 'MANAGER' &&
      data.role === 'MANAGER'
    ) {
      throw new AppError(
        'Only Super Admin can create another manager.',
        403,
      );
    }

    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!branch) {
      throw new AppError('Selected branch does not exist.', 404);
    }

    const existingLogin = await prisma.employee.findUnique({
      where: { loginId: data.loginId },
      select: { id: true },
    });

    if (existingLogin) {
      throw new AppError('Login ID is already in use.', 409);
    }

    const email = normalizeOptional(data.email);
    const phone = normalizeOptional(data.phone);

    if (email) {
      const existingEmail = await prisma.employee.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingEmail) {
        throw new AppError('Email is already in use.', 409);
      }
    }

    if (phone) {
      const existingPhone = await prisma.employee.findUnique({
        where: { phone },
        select: { id: true },
      });

      if (existingPhone) {
        throw new AppError('Phone number is already in use.', 409);
      }
    }

    const passwordHash = await hashPassword(data.password);

    const employee = await prisma.employee.create({
      data: {
        fullName: data.fullName,
        email,
        phone,
        loginId: data.loginId,
        passwordHash,
        role: data.role,
        branchId: data.branchId,
        department: normalizeOptional(data.department),
        joiningDate: data.joiningDate ?? new Date(),
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
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'CREATE_EMPLOYEE',
      entity: 'Employee',
      entityId: employee.id,
      metadata: {
        role: employee.role,
        branchId: employee.branchId,
      },
    });

    res.status(201).json({
      message: 'Employee created successfully.',
      employee,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| LIST EMPLOYEES
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const where =
      req.employee!.role === 'MANAGER'
        ? {
            branchId: req.employee!.branchId,
          }
        : {};

    const employees = await prisma.employee.findMany({
      where,
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
        managesBranch: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ employees });
  }),
);

/*
|--------------------------------------------------------------------------
| EMPLOYEE DETAILS
|--------------------------------------------------------------------------
*/

router.get(
  '/:id',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const { id } = employeeIdSchema.parse(req.params);

    const employee = await getEmployeeOrThrow(id);

    ensureManagerCanAccessEmployee(req.employee!, employee);
    ensureManagerCanManageTarget(req.employee!, employee);

    const {
      passwordHash: _passwordHash,
      ...safeEmployee
    } = employee;

    res.json({
      employee: safeEmployee,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| EDIT EMPLOYEE DETAILS
|--------------------------------------------------------------------------
*/

router.put(
  '/:id',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const { id } = employeeIdSchema.parse(req.params);
    const data = updateEmployeeSchema.parse(req.body);

    const target = await prisma.employee.findUnique({
      where: { id },
    });

    if (!target) {
      throw new AppError('Employee not found.', 404);
    }

    ensureManagerCanAccessEmployee(req.employee!, target);
    ensureManagerCanManageTarget(req.employee!, target);

    const email = normalizeOptional(data.email);
    const phone = normalizeOptional(data.phone);

    if (email && email !== target.email) {
      const existingEmail = await prisma.employee.findFirst({
        where: {
          email,
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingEmail) {
        throw new AppError('Email is already in use.', 409);
      }
    }

    if (phone && phone !== target.phone) {
      const existingPhone = await prisma.employee.findFirst({
        where: {
          phone,
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingPhone) {
        throw new AppError('Phone number is already in use.', 409);
      }
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...(data.fullName !== undefined && {
          fullName: data.fullName,
        }),
        ...(data.email !== undefined && {
          email,
        }),
        ...(data.phone !== undefined && {
          phone,
        }),
        ...(data.department !== undefined && {
          department: normalizeOptional(data.department),
        }),
        ...(data.joiningDate !== undefined && {
          joiningDate: data.joiningDate,
        }),
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
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'UPDATE_EMPLOYEE',
      entity: 'Employee',
      entityId: employee.id,
      metadata: {
        changedFields: Object.keys(data),
      },
    });

    res.json({
      message: 'Employee updated successfully.',
      employee,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| ACTIVATE / DEACTIVATE
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id/status',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const { id } = employeeIdSchema.parse(req.params);
    const { status } = statusSchema.parse(req.body);

    const target = await prisma.employee.findUnique({
      where: { id },
    });

    if (!target) {
      throw new AppError('Employee not found.', 404);
    }

    ensureManagerCanAccessEmployee(req.employee!, target);
    ensureManagerCanManageTarget(req.employee!, target);

    if (
      status === 'INACTIVE' &&
      target.id === req.employee!.employeeId
    ) {
      throw new AppError(
        'You cannot deactivate your own account.',
        400,
      );
    }

    /*
     * A manager assigned to a branch must be replaced before
     * that employee can be deactivated.
     */
    if (status === 'INACTIVE') {
      const managedBranch = await prisma.branch.findUnique({
        where: {
          managerId: target.id,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (managedBranch) {
        throw new AppError(
          `Employee is the manager of ${managedBranch.name}. Assign another manager before deactivating this employee.`,
          409,
        );
      }
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        fullName: true,
        status: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action:
        status === 'ACTIVE'
          ? 'ACTIVATE_EMPLOYEE'
          : 'DEACTIVATE_EMPLOYEE',
      entity: 'Employee',
      entityId: employee.id,
      metadata: {
        status,
      },
    });

    res.json({
      message:
        status === 'ACTIVE'
          ? 'Employee activated successfully.'
          : 'Employee deactivated successfully.',
      employee,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| CHANGE ROLE
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id/role',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = employeeIdSchema.parse(req.params);
    const { role } = roleSchema.parse(req.body);

    const target = await prisma.employee.findUnique({
      where: { id },
    });

    if (!target) {
      throw new AppError('Employee not found.', 404);
    }

    if (target.id === req.employee!.employeeId) {
      throw new AppError(
        'You cannot change your own role.',
        400,
      );
    }

    /*
     * If an existing branch manager is changed away from
     * MANAGER, prevent the branch from retaining an invalid
     * manager relationship.
     */
    if (target.role === 'MANAGER' && role !== 'MANAGER') {
      const managedBranch = await prisma.branch.findUnique({
        where: {
          managerId: target.id,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (managedBranch) {
        throw new AppError(
          `Employee currently manages ${managedBranch.name}. Assign another manager before changing this role.`,
          409,
        );
      }
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        fullName: true,
        role: true,
        branchId: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'CHANGE_EMPLOYEE_ROLE',
      entity: 'Employee',
      entityId: employee.id,
      metadata: {
        oldRole: target.role,
        newRole: role,
      },
    });

    res.json({
      message: 'Employee role changed successfully.',
      employee,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| ASSIGN / REASSIGN BRANCH
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id/branch',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = employeeIdSchema.parse(req.params);
    const { branchId } = branchSchema.parse(req.body);

    const target = await prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        role: true,
        branchId: true,
      },
    });

    if (!target) {
      throw new AppError('Employee not found.', 404);
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!branch) {
      throw new AppError('Selected branch does not exist.', 404);
    }

    if (target.branchId === branchId) {
      return res.json({
        message: 'Employee is already assigned to this branch.',
        employee: target,
      });
    }

    /*
     * A manager can only be reassigned if the target branch
     * does not already have another manager.
     *
     * We do not automatically replace an existing manager.
     */
    if (target.role === 'MANAGER') {
      const existingManager = await prisma.branch.findUnique({
        where: {
          managerId: target.id,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (existingManager) {
        throw new AppError(
          `Employee is currently the manager of ${existingManager.name}. Reassign that branch manager first.`,
          409,
        );
      }

      const targetBranchManager = await prisma.branch.findUnique({
        where: {
          id: branchId,
        },
        select: {
          managerId: true,
        },
      });

      if (targetBranchManager?.managerId) {
        throw new AppError(
          'The selected branch already has a manager.',
          409,
        );
      }
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        branchId,
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        branchId: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'REASSIGN_EMPLOYEE_BRANCH',
      entity: 'Employee',
      entityId: employee.id,
      metadata: {
        oldBranchId: target.branchId,
        newBranchId: branchId,
      },
    });

    res.json({
      message: 'Employee branch assignment updated successfully.',
      employee,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| RESET PASSWORD
|--------------------------------------------------------------------------
*/

router.post(
  '/:id/reset-password',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req, res) => {
    const { id } = employeeIdSchema.parse(req.params);
    const { newPassword } = resetPasswordSchema.parse(req.body);

    const target = await prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        role: true,
        branchId: true,
      },
    });

    if (!target) {
      throw new AppError('Employee not found.', 404);
    }

    ensureManagerCanAccessEmployee(req.employee!, target);
    ensureManagerCanManageTarget(req.employee!, target);

    const passwordHash = await hashPassword(newPassword);

    await prisma.employee.update({
      where: { id },
      data: { passwordHash },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'RESET_PASSWORD',
      entity: 'Employee',
      entityId: target.id,
      metadata: {
        employeeName: target.fullName,
      },
    });

    res.json({
      message: 'Employee password reset successfully.',
    });
  }),
);

export default router;