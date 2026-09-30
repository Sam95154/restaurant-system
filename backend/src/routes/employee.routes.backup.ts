import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { requireEmployeeAuth } from '../middleware/auth';
import { requireRole, requireBranchAccess } from '../middleware/rbac';
import { hashPassword } from '../utils/password';
import { logAudit } from '../services/audit.service';
import { AppError } from '../utils/errors';

const router = Router();

const ROLE_MANAGING_ROLES = ['SUPER_ADMIN', 'MANAGER'];

const createEmployeeSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  loginId: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(['MANAGER', 'SERVICE_EMPLOYEE', 'KITCHEN_EMPLOYEE', 'BILLING_EMPLOYEE']),
  branchId: z.string().uuid(),
  department: z.string().optional(),
});

// SUPER_ADMIN creates anyone; a MANAGER may only create staff for their own branch.
router.post(
  '/',
  requireEmployeeAuth,
  requireRole(...ROLE_MANAGING_ROLES),
  asyncHandler(async (req, res) => {
    const data = createEmployeeSchema.parse(req.body);
    if (req.employee!.role === 'MANAGER' && data.branchId !== req.employee!.branchId) {
      throw new AppError('Managers can only create employees for their own branch.', 403);
    }
    if (req.employee!.role === 'MANAGER' && data.role === 'MANAGER') {
      throw new AppError('Only Super Admin can create another manager.', 403);
    }

    const passwordHash = await hashPassword(data.password);
    const employee = await prisma.employee.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        loginId: data.loginId,
        passwordHash,
        role: data.role,
        branchId: data.branchId,
        department: data.department,
      },
    });
    await logAudit({ userId: req.employee!.employeeId, action: 'CREATE_EMPLOYEE', entity: 'Employee', entityId: employee.id });
    const { passwordHash: _omit, ...safe } = employee;
    res.status(201).json({ employee: safe });
  })
);

router.get(
  '/',
  requireEmployeeAuth,
  requireRole(...ROLE_MANAGING_ROLES),
  asyncHandler(async (req, res) => {
    const branchFilter = req.employee!.role === 'MANAGER' ? { branchId: req.employee!.branchId } : {};
    const employees = await prisma.employee.findMany({ where: branchFilter as any, select: {
      id: true, fullName: true, email: true, phone: true, role: true, branchId: true, status: true, joiningDate: true, loginId: true,
    } });
    res.json({ employees });
  })
);

router.patch(
  '/:id/status',
  requireEmployeeAuth,
  requireRole(...ROLE_MANAGING_ROLES),
  asyncHandler(async (req, res) => {
    const status = z.enum(['ACTIVE', 'INACTIVE']).parse(req.body.status);
    const target = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError('Employee not found.', 404);
    if (req.employee!.role === 'MANAGER' && target.branchId !== req.employee!.branchId) {
      throw new AppError('Managers can only manage employees at their own branch.', 403);
    }
    // Deactivation, never deletion - historical orders/bills must stay intact.
    const employee = await prisma.employee.update({ where: { id: req.params.id }, data: { status } });
    await logAudit({ userId: req.employee!.employeeId, action: status === 'ACTIVE' ? 'ACTIVATE_EMPLOYEE' : 'DEACTIVATE_EMPLOYEE', entity: 'Employee', entityId: employee.id });
    res.json({ employee: { id: employee.id, status: employee.status } });
  })
);

router.patch(
  '/:id/role',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const role = z.enum(['MANAGER', 'SERVICE_EMPLOYEE', 'KITCHEN_EMPLOYEE', 'BILLING_EMPLOYEE']).parse(req.body.role);
    const employee = await prisma.employee.update({ where: { id: req.params.id }, data: { role } });
    await logAudit({ userId: req.employee!.employeeId, action: 'CHANGE_EMPLOYEE_ROLE', entity: 'Employee', entityId: employee.id, metadata: { role } });
    res.json({ employee: { id: employee.id, role: employee.role } });
  })
);

router.post(
  '/:id/reset-password',
  requireEmployeeAuth,
  requireRole(...ROLE_MANAGING_ROLES),
  asyncHandler(async (req, res) => {
    const newPassword = z.string().min(6).parse(req.body.newPassword);
    const passwordHash = await hashPassword(newPassword);
    await prisma.employee.update({ where: { id: req.params.id }, data: { passwordHash } });
    await logAudit({ userId: req.employee!.employeeId, action: 'RESET_PASSWORD', entity: 'Employee', entityId: req.params.id });
    res.json({ ok: true });
  })
);

export default router;
