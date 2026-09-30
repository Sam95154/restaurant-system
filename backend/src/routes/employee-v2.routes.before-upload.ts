import { Router, Response } from 'express';

import { z } from 'zod';

import { prisma } from '../config/db';

import { asyncHandler } from '../utils/asyncHandler';

import { requireEmployeeAuth } from '../middleware/auth';

import { requireRole } from '../middleware/rbac';

import { logAudit } from '../services/audit.service';

const router = Router();

const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'MANAGER'] as const;

const profileSchema = z.object({
  dateOfBirth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  emergencyContactRelation: z.string().optional().nullable(),
});

async function getEmployeeForAccess(employeeId: string, currentEmployee: any) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      branch: true,
      profile: true,
      documents: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (
    currentEmployee.role === 'MANAGER' &&
    employee.branchId !== currentEmployee.branchId
  ) {
    throw new Error('You cannot access employees from another branch');
  }

  return employee;
}

/**
 * GET employee V2 profile
 */
router.get(
  '/:id/profile',
  requireEmployeeAuth,
  asyncHandler(async (req: any, res: Response) => {
    const employee = await getEmployeeForAccess(
      req.params.id,
      req.employee
    );

    res.json({
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        email: employee.email,
        phone: employee.phone,
        loginId: employee.loginId,
        role: employee.role,
        department: employee.department,
        status: employee.status,
        joiningDate: employee.joiningDate,
        branchId: employee.branchId,
        photoStorageKey: employee.photoStorageKey,
        profile: employee.profile,
        documents: employee.documents,
      },
    });
  })
);

/**
 * UPDATE employee profile
 */
router.put(
  '/:id/profile',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req: any, res: Response) => {
    const employee = await getEmployeeForAccess(
      req.params.id,
      req.employee
    );

    const data = profileSchema.parse(req.body);

    const profile = await prisma.employeeProfile.upsert({
      where: {
        employeeId: employee.id,
      },
      create: {
        employeeId: employee.id,
        dateOfBirth: data.dateOfBirth
          ? new Date(data.dateOfBirth)
          : null,
        gender: data.gender || null,
        address: data.address || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        emergencyContactRelation:
          data.emergencyContactRelation || null,
      },
      update: {
        dateOfBirth: data.dateOfBirth
          ? new Date(data.dateOfBirth)
          : null,
        gender: data.gender || null,
        address: data.address || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        emergencyContactRelation:
          data.emergencyContactRelation || null,
      },
    });

    await logAudit({
      userId: req.employee.id,
userRole: req.employee.role,
      action: 'UPDATE_EMPLOYEE_PROFILE',
      entity: 'EmployeeProfile',
      entityId: employee.id,
      metadata: {
        targetEmployeeId: employee.id,
      },
    });

    res.json({ profile });
  })
);

/**
 * DELETE employee profile
 */
router.delete(
  '/:id/profile',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req: any, res: Response) => {
    const employee = await getEmployeeForAccess(
      req.params.id,
      req.employee
    );

    await prisma.employeeProfile.deleteMany({
      where: {
        employeeId: employee.id,
      },
    });

    await logAudit({
      userId: req.employee.id,
userRole: req.employee.role,
      action: 'DELETE_EMPLOYEE_PROFILE',
      entity: 'EmployeeProfile',
      entityId: employee.id,
      metadata: {
        targetEmployeeId: employee.id,
      },
    });

    res.json({ message: 'Employee profile deleted' });
  })
);

export default router;