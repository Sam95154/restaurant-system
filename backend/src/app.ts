import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import supplierRoutes from './routes/supplier.routes';
import authRoutes from './routes/auth.routes';
import branchRoutes from './routes/branch.routes';
import employeeRoutes from './routes/employee.routes';
import categoryRoutes from './routes/category.routes';
import itemRoutes from './routes/item.routes';
import tableRoutes from './routes/table.routes';
import orderRoutes from './routes/order.routes';
import couponRoutes from './routes/coupon.routes';
import billRoutes from './routes/bill.routes';
import paymentRoutes from './routes/payment.routes';
import reviewRoutes from './routes/review.routes';
import reportRoutes from './routes/report.routes';
import notificationRoutes from './routes/notification.routes';
import auditRoutes from './routes/audit.routes';
import inventoryRoutes from './routes/inventory.routes';
import purchaseRoutes from './routes/purchase.routes';
import attendanceRoutes from './routes/attendance.routes';
import payrollRoutes from './routes/payroll.routes';
import expenseRoutes from './routes/expense.routes';
import settingsRoutes from './routes/settings.routes';
import employeeV2Routes from './routes/employee-v2.routes';
import waitingQueueRoutes from './routes/waiting-queue.routes';
export const app = express();

app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads')),
);

app.use(helmet());

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

// General API rate limit; auth/OTP routes get a tighter limit below (spec section 41).
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    max: 120,
  }),
);

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 60_000,
    max: 20,
  }),
);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/waiting-queue', waitingQueueRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);

/*
 * Audit Logs
 *
 * Frontend endpoint:
 * GET /api/audit
 *
 * auditRoutes itself defines:
 * GET /
 * and therefore this mount creates:
 * GET /api/audit
 */
app.use('/api/audit', auditRoutes);

app.use('/api/settings', settingsRoutes);
app.use('/api/employees/v2', employeeV2Routes);

app.use((req, res) =>
  res
    .status(404)
    .json({
      error: `No route for ${req.method} ${req.path}`,
    }),
);

app.use(errorHandler);