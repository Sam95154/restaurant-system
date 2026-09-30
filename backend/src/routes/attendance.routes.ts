import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, AttendanceStatus, LeaveStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { requireEmployeeAuth } from '../middleware/auth';
import { AppError } from '../utils/errors';

const router = Router();
const prisma = new PrismaClient();

const asyncHandler =
  (
    handler: (
      req: Request,
      res: Response,
      next: NextFunction
    ) => Promise<void>
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

const getEmployee = (req: Request) => {
  return (req as any).employee;
};

const managementRoles: Role[] = [Role.SUPER_ADMIN, Role.MANAGER];

const canManageAttendance = (role: Role) =>
  managementRoles.includes(role);

const dateOnly = (value: Date) =>
  new Date(
    Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    )
  );

/* ============================================================
   ATTENDANCE
   ============================================================ */

/**
 * GET /api/attendance
 *
 * Query:
 * branchId
 * employeeId
 * date
 * startDate
 * endDate
 * status
 */
router.get(
  '/',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = getEmployee(req);

    const branchId =
      typeof req.query.branchId === 'string'
        ? req.query.branchId
        : undefined;

    const employeeId =
      typeof req.query.employeeId === 'string'
        ? req.query.employeeId
        : undefined;

    const date =
      typeof req.query.date === 'string'
        ? req.query.date
        : undefined;

    const startDate =
      typeof req.query.startDate === 'string'
        ? req.query.startDate
        : undefined;

    const endDate =
      typeof req.query.endDate === 'string'
        ? req.query.endDate
        : undefined;

    const status =
      typeof req.query.status === 'string'
        ? req.query.status
        : undefined;

    /*
     * Non-super-admin users can only access
     * their own branch.
     */
    if (
      employee.role !== Role.SUPER_ADMIN &&
      branchId &&
      employee.branchId !== branchId
    ) {
      throw new AppError(
        'You do not have access to this branch',
        403
      );
    }

    /*
     * Regular employees can only view
     * their own attendance.
     */
    const where: any = {};

    if (employee.role === Role.SUPER_ADMIN) {
      if (branchId) {
        where.branchId = branchId;
      }
    } else {
      where.branchId = employee.branchId;

      if (!canManageAttendance(employee.role)) {
        where.employeeId = employee.id;
      } else if (employeeId) {
        where.employeeId = employeeId;
      }
    }

    if (date) {
      const parsedDate = new Date(`${date}T00:00:00.000Z`);

      if (Number.isNaN(parsedDate.getTime())) {
        throw new AppError('Invalid date', 400);
      }

      where.date = parsedDate;
    }

    if (startDate || endDate) {
      where.date = {};

      if (startDate) {
        const parsedStart = new Date(
          `${startDate}T00:00:00.000Z`
        );

        if (Number.isNaN(parsedStart.getTime())) {
          throw new AppError('Invalid startDate', 400);
        }

        where.date.gte = parsedStart;
      }

      if (endDate) {
        const parsedEnd = new Date(
          `${endDate}T00:00:00.000Z`
        );

        if (Number.isNaN(parsedEnd.getTime())) {
          throw new AppError('Invalid endDate', 400);
        }

        where.date.lte = parsedEnd;
      }
    }

    if (status) {
      if (
        !Object.values(AttendanceStatus).includes(
          status as AttendanceStatus
        )
      ) {
        throw new AppError('Invalid attendance status', 400);
      }

      where.status = status;
    }

    const attendance = await prisma.attendance.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            loginId: true,
            role: true,
            department: true,
            branchId: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json(attendance);
  })
);

/**
 * GET /api/attendance/:id
 */
router.get(
  '/:id',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = getEmployee(req);

    const attendance = await prisma.attendance.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            loginId: true,
            role: true,
            department: true,
            branchId: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!attendance) {
      throw new AppError('Attendance record not found', 404);
    }

    if (
      employee.role !== Role.SUPER_ADMIN &&
      attendance.branchId !== employee.branchId
    ) {
      throw new AppError(
        'You do not have access to this attendance record',
        403
      );
    }

    if (
      !canManageAttendance(employee.role) &&
      employee.id !== attendance.employeeId
    ) {
      throw new AppError(
        'You can only access your own attendance',
        403
      );
    }

    res.json(attendance);
  })
);

/**
 * POST /api/attendance
 *
 * Management can manually create attendance.
 */
const createAttendanceSchema = z.object({
  employeeId: z.string().uuid(),
  branchId: z.string().uuid(),
  date: z.string(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  checkIn: z.string().datetime().optional().nullable(),
  checkOut: z.string().datetime().optional().nullable(),
  workingHours: z.number().min(0).optional().nullable(),
  remarks: z.string().max(1000).optional().nullable(),
});

router.post(
  '/',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = getEmployee(req);

    if (!canManageAttendance(employee.role)) {
      throw new AppError(
        'Only managers can create attendance records',
        403
      );
    }

    const data = createAttendanceSchema.parse(req.body);

    if (
      employee.role !== Role.SUPER_ADMIN &&
      employee.branchId !== data.branchId
    ) {
      throw new AppError(
        'You cannot create attendance for another branch',
        403
      );
    }

    const targetEmployee = await prisma.employee.findUnique({
      where: {
        id: data.employeeId,
      },
      select: {
        id: true,
        branchId: true,
        status: true,
      },
    });

    if (!targetEmployee) {
      throw new AppError('Employee not found', 404);
    }

    if (targetEmployee.branchId !== data.branchId) {
      throw new AppError(
        'Employee does not belong to the selected branch',
        400
      );
    }

    const attendanceDate = new Date(
      `${data.date}T00:00:00.000Z`
    );

    if (Number.isNaN(attendanceDate.getTime())) {
      throw new AppError('Invalid attendance date', 400);
    }

    const attendance = await prisma.attendance.create({
      data: {
        employeeId: data.employeeId,
        branchId: data.branchId,
        date: attendanceDate,
        status: data.status ?? AttendanceStatus.PRESENT,
        checkIn: data.checkIn
          ? new Date(data.checkIn)
          : null,
        checkOut: data.checkOut
          ? new Date(data.checkOut)
          : null,
        workingHours:
          data.workingHours !== undefined &&
          data.workingHours !== null
            ? data.workingHours
            : undefined,
        remarks: data.remarks ?? null,
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: employee.id,
        userRole: employee.role,
        action: 'ATTENDANCE_CREATED',
        entity: 'Attendance',
        entityId: attendance.id,
        metadata: {
          employeeId: data.employeeId,
          date: data.date,
          status: data.status ?? AttendanceStatus.PRESENT,
        },
      },
    });

    res.status(201).json(attendance);
  })
);

/**
 * POST /api/attendance/check-in
 *
 * Employee checks themselves in.
 */
const checkInSchema = z.object({
  branchId: z.string().uuid().optional(),
  date: z.string().optional(),
  remarks: z.string().max(1000).optional(),
});

router.post(
  '/check-in',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = getEmployee(req);

    if (!employee.branchId) {
      throw new AppError(
        'You are not assigned to a branch',
        400
      );
    }

    const data = checkInSchema.parse(req.body);

    if (
      data.branchId &&
      data.branchId !== employee.branchId &&
      employee.role !== Role.SUPER_ADMIN
    ) {
      throw new AppError(
        'You cannot check in to another branch',
        403
      );
    }

    const dateString =
      data.date ??
      new Date().toISOString().slice(0, 10);

    const attendanceDate = new Date(
      `${dateString}T00:00:00.000Z`
    );

    if (Number.isNaN(attendanceDate.getTime())) {
      throw new AppError('Invalid date', 400);
    }

    const existing = await prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date: attendanceDate,
      },
    });

    if (existing?.checkIn) {
      throw new AppError(
        'You have already checked in for this date',
        400
      );
    }

    const now = new Date();

    const attendance = existing
      ? await prisma.attendance.update({
          where: {
            id: existing.id,
          },
          data: {
            checkIn: now,
            status:
              existing.status === AttendanceStatus.LEAVE
                ? AttendanceStatus.PRESENT
                : existing.status,
            remarks:
              data.remarks !== undefined
                ? data.remarks
                : existing.remarks,
          },
        })
      : await prisma.attendance.create({
          data: {
            employee: {
              connect: {
                id: employee.id,
              },
            },
            branch: {
              connect: {
                id: employee.branchId,
              },
            },
            date: attendanceDate,
            status: AttendanceStatus.PRESENT,
            checkIn: now,
            remarks: data.remarks ?? null,
          },
        });

    await prisma.auditLog.create({
      data: {
        userId: employee.id,
        userRole: employee.role,
        action: 'ATTENDANCE_CHECK_IN',
        entity: 'Attendance',
        entityId: attendance.id,
        metadata: {
          date: dateString,
        },
      },
    });

    res.status(201).json(attendance);
  })
);

/**
 * POST /api/attendance/check-out
 *
 * Employee checks themselves out.
 */
const checkOutSchema = z.object({
  date: z.string().optional(),
  remarks: z.string().max(1000).optional(),
});

router.post(
  '/check-out',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = getEmployee(req);

    if (!employee.branchId) {
      throw new AppError(
        'You are not assigned to a branch',
        400
      );
    }

    const data = checkOutSchema.parse(req.body);

    const dateString =
      data.date ??
      new Date().toISOString().slice(0, 10);

    const attendanceDate = new Date(
      `${dateString}T00:00:00.000Z`
    );

    if (Number.isNaN(attendanceDate.getTime())) {
      throw new AppError('Invalid date', 400);
    }

    const existing = await prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date: attendanceDate,
      },
    });

    if (!existing) {
      throw new AppError(
        'No attendance record found. Please check in first.',
        400
      );
    }

    if (!existing.checkIn) {
      throw new AppError(
        'You have not checked in yet',
        400
      );
    }

    if (existing.checkOut) {
      throw new AppError(
        'You have already checked out for this date',
        400
      );
    }

    const now = new Date();

    const workingHours =
      Math.max(
        0,
        now.getTime() - existing.checkIn.getTime()
      ) /
      (1000 * 60 * 60);

    const attendance = await prisma.attendance.update({
      where: {
        id: existing.id,
      },
      data: {
        checkOut: now,
        workingHours: Number(workingHours.toFixed(2)),
        remarks:
          data.remarks !== undefined
            ? data.remarks
            : existing.remarks,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: employee.id,
        userRole: employee.role,
        action: 'ATTENDANCE_CHECK_OUT',
        entity: 'Attendance',
        entityId: attendance.id,
        metadata: {
          date: dateString,
          workingHours: Number(workingHours.toFixed(2)),
        },
      },
    });

    res.json(attendance);
  })
);

/**
 * PUT /api/attendance/:id
 *
 * Management update.
 */
const updateAttendanceSchema = z.object({
  status: z.nativeEnum(AttendanceStatus).optional(),
  checkIn: z.string().datetime().optional().nullable(),
  checkOut: z.string().datetime().optional().nullable(),
  workingHours: z.number().min(0).optional().nullable(),
  remarks: z.string().max(1000).optional().nullable(),
});

router.put(
  '/:id',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = getEmployee(req);

    if (!canManageAttendance(employee.role)) {
      throw new AppError(
        'Only managers can update attendance',
        403
      );
    }

    const data = updateAttendanceSchema.parse(req.body);

    const existing = await prisma.attendance.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      throw new AppError(
        'Attendance record not found',
        404
      );
    }

    if (
      employee.role !== Role.SUPER_ADMIN &&
      existing.branchId !== employee.branchId
    ) {
      throw new AppError(
        'You cannot update attendance for another branch',
        403
      );
    }

    const attendance = await prisma.attendance.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(data.status !== undefined && {
          status: data.status,
        }),
        ...(data.checkIn !== undefined && {
          checkIn: data.checkIn
            ? new Date(data.checkIn)
            : null,
        }),
        ...(data.checkOut !== undefined && {
          checkOut: data.checkOut
            ? new Date(data.checkOut)
            : null,
        }),
        ...(data.workingHours !== undefined && {
          workingHours: data.workingHours,
        }),
        ...(data.remarks !== undefined && {
          remarks: data.remarks,
        }),
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: employee.id,
        userRole: employee.role,
        action: 'ATTENDANCE_UPDATED',
        entity: 'Attendance',
        entityId: existing.id,
        metadata: data,
      },
    });

    res.json(attendance);
  })
);

/* ============================================================
   LEAVE
   ============================================================ */

/**
 * GET /api/attendance/leaves
 */
router.get(
  '/leaves/list',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = getEmployee(req);

    const branchId =
      typeof req.query.branchId === 'string'
        ? req.query.branchId
        : undefined;

    const employeeId =
      typeof req.query.employeeId === 'string'
        ? req.query.employeeId
        : undefined;

    const status =
      typeof req.query.status === 'string'
        ? req.query.status
        : undefined;

    if (
      employee.role !== Role.SUPER_ADMIN &&
      branchId &&
      employee.branchId !== branchId
    ) {
      throw new AppError(
        'You do not have access to this branch',
        403
      );
    }

    const where: any = {};

    if (employee.role === Role.SUPER_ADMIN) {
      if (branchId) {
        where.branchId = branchId;
      }
    } else {
      where.branchId = employee.branchId;

      if (!canManageAttendance(employee.role)) {
        where.employeeId = employee.id;
      } else if (employeeId) {
        where.employeeId = employeeId;
      }
    }

    if (status) {
      if (
        !Object.values(LeaveStatus).includes(
          status as LeaveStatus
        )
      ) {
        throw new AppError('Invalid leave status', 400);
      }

      where.status = status;
    }

    const leaves = await prisma.leave.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            loginId: true,
            role: true,
            department: true,
            branchId: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startDate: 'desc',
      },
    });

    res.json(leaves);
  })
);

/**
 * POST /api/attendance/leaves
 */
const createLeaveSchema = z.object({
  employeeId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().max(1000).optional().nullable(),
  remarks: z.string().max(1000).optional().nullable(),
});

router.post(
  '/leaves',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = getEmployee(req);

    const data = createLeaveSchema.parse(req.body);

    const targetEmployeeId =
      data.employeeId ?? employee.id;

    const targetEmployee =
      await prisma.employee.findUnique({
        where: {
          id: targetEmployeeId,
        },
        select: {
          id: true,
          branchId: true,
          fullName: true,
        },
      });

    if (!targetEmployee) {
      throw new AppError('Employee not found', 404);
    }

    if (
      !canManageAttendance(employee.role) &&
      targetEmployee.id !== employee.id
    ) {
      throw new AppError(
        'You can only request leave for yourself',
        403
      );
    }

    if (
      employee.role !== Role.SUPER_ADMIN &&
      targetEmployee.branchId !== employee.branchId
    ) {
      throw new AppError(
        'You cannot create leave for another branch',
        403
      );
    }

    if (!targetEmployee.branchId) {
      throw new AppError(
        'Employee is not assigned to a branch',
        400
      );
    }

    if (
      data.branchId &&
      data.branchId !== targetEmployee.branchId
    ) {
      throw new AppError(
        'Branch does not match employee branch',
        400
      );
    }

    const startDate = new Date(
      `${data.startDate}T00:00:00.000Z`
    );

    const endDate = new Date(
      `${data.endDate}T00:00:00.000Z`
    );

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      throw new AppError(
        'Invalid leave dates',
        400
      );
    }

    if (endDate < startDate) {
      throw new AppError(
        'End date cannot be before start date',
        400
      );
    }

    const overlappingLeave =
      await prisma.leave.findFirst({
        where: {
          employeeId: targetEmployee.id,
          status: {
            in: [
              LeaveStatus.PENDING,
              LeaveStatus.APPROVED,
            ],
          },
          startDate: {
            lte: endDate,
          },
          endDate: {
            gte: startDate,
          },
        },
      });

    if (overlappingLeave) {
      throw new AppError(
        'An overlapping leave request already exists',
        400
      );
    }

    const leave = await prisma.leave.create({
      data: {
        employeeId: targetEmployee.id,
        branchId: targetEmployee.branchId,
        startDate,
        endDate,
        reason: data.reason ?? null,
        remarks: data.remarks ?? null,
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: employee.id,
        userRole: employee.role,
        action: 'LEAVE_CREATED',
        entity: 'Leave',
        entityId: leave.id,
        metadata: {
          employeeId: targetEmployee.id,
          startDate: data.startDate,
          endDate: data.endDate,
        },
      },
    });

    res.status(201).json(leave);
  })
);

/**
 * PATCH /api/attendance/leaves/:id/status
 */
const updateLeaveStatusSchema = z.object({
  status: z.enum([
    LeaveStatus.APPROVED,
    LeaveStatus.REJECTED,
    LeaveStatus.CANCELLED,
  ]),
  remarks: z.string().max(1000).optional().nullable(),
});

router.patch(
  '/leaves/:id/status',
  requireEmployeeAuth,
  asyncHandler(async (req, res) => {
    const employee = getEmployee(req);

    const data = updateLeaveStatusSchema.parse(
      req.body
    );

    const existing = await prisma.leave.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      throw new AppError(
        'Leave request not found',
        404
      );
    }

    if (
      employee.role !== Role.SUPER_ADMIN &&
      existing.branchId !== employee.branchId
    ) {
      throw new AppError(
        'You cannot manage leave for another branch',
        403
      );
    }

    /*
     * Employees can cancel their own pending leave.
     * Only management can approve/reject.
     */
    if (
      data.status !== LeaveStatus.CANCELLED &&
      !canManageAttendance(employee.role)
    ) {
      throw new AppError(
        'Only managers can approve or reject leave',
        403
      );
    }

    if (
      data.status === LeaveStatus.CANCELLED &&
      !canManageAttendance(employee.role) &&
      existing.employeeId !== employee.id
    ) {
      throw new AppError(
        'You can only cancel your own leave',
        403
      );
    }

    if (
      data.status === LeaveStatus.CANCELLED &&
      existing.status !== LeaveStatus.PENDING
    ) {
      throw new AppError(
        'Only pending leave can be cancelled',
        400
      );
    }

    const leave = await prisma.leave.update({
      where: {
        id: existing.id,
      },
      data: {
        status: data.status,
        ...(data.remarks !== undefined && {
          remarks: data.remarks,
        }),
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: employee.id,
        userRole: employee.role,
        action: `LEAVE_${data.status}`,
        entity: 'Leave',
        entityId: existing.id,
        metadata: {
          employeeId: existing.employeeId,
          status: data.status,
        },
      },
    });

    res.json(leave);
  })
);

export default router;
