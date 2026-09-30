import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { verifyPassword } from '../utils/password';
import { signCustomerToken, signEmployeeToken } from '../utils/jwt';
import { sendOtp, verifyOtp } from '../services/otp.service';
import { requireEmployeeAuth, requireCustomerAuth } from '../middleware/auth';

const router = Router();

// --- Employee login (login ID + password) ---
const employeeLoginSchema = z.object({
  loginId: z.string().min(1),
  password: z.string().min(1),
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { loginId, password } = employeeLoginSchema.parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { loginId } });
    if (!employee || employee.status !== 'ACTIVE') throw new AppError('Invalid credentials.', 401);

    const ok = await verifyPassword(password, employee.passwordHash);
    if (!ok) throw new AppError('Invalid credentials.', 401);

    const token = signEmployeeToken({ employeeId: employee.id, role: employee.role, branchId: employee.branchId });
    res.json({
      token,
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        role: employee.role,
        branchId: employee.branchId,
      },
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
  })
);

// --- Customer passwordless login ---
const sendOtpSchema = z.object({ identifier: z.string().min(3) });

router.post(
  '/customer/send-otp',
  asyncHandler(async (req, res) => {
    const { identifier } = sendOtpSchema.parse(req.body);
    const result = await sendOtp(identifier);
    // devCode is only ever present when OTP_PROVIDER=MOCK (local dev). A
    // production provider never returns the code in the API response.
    res.json({ customerId: result.customerId, devCode: result.devCode });
  })
);

const verifyOtpSchema = z.object({ customerId: z.string().uuid(), code: z.string().length(4) });

router.post(
  '/customer/verify-otp',
  asyncHandler(async (req, res) => {
    const { customerId, code } = verifyOtpSchema.parse(req.body);
    await verifyOtp(customerId, code);
    const token = signCustomerToken({ customerId });
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    res.json({ token, customer });
  })
);

router.get(
  '/me',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = await prisma.employee.findUnique({ where: { id: req.employee!.employeeId } });
    res.json({ employee });
  })
);

router.get(
  '/customer/me',
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({ where: { id: req.customer!.customerId } });
    res.json({ customer });
  })
);

export default router;
