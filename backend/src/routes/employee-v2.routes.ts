import { Router, Response } from 'express';

import { z } from 'zod';

import { prisma } from '../config/db';

import { asyncHandler } from '../utils/asyncHandler';

import { requireEmployeeAuth } from '../middleware/auth';

import { requireRole } from '../middleware/rbac';

import { logAudit } from '../services/audit.service';
import { employeePhotoUpload, employeeDocumentUpload } from '../middleware/employeeUpload';
import fs from 'fs';
import path from 'path';

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
      userId: req.employee.employeeId,
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
      userId: req.employee.employeeId,
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


/**
 * UPLOAD / REPLACE employee profile photo
 */
router.post(
  '/:id/photo',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  employeePhotoUpload.single('photo'),
  asyncHandler(async (req: any, res: Response) => {
    const employee = await getEmployeeForAccess(
      req.params.id,
      req.employee
    );

    if (!req.file) {
      res.status(400).json({
        message: 'Employee photo is required',
      });
      return;
    }

    const previousStorageKey = employee.photoStorageKey;

    const storageKey = path
      .join('employees', 'photos', req.file.filename)
      .replace(/\\/g, '/');

    const updatedEmployee = await prisma.employee.update({
      where: {
        id: employee.id,
      },
      data: {
        photoStorageKey: storageKey,
      },
      select: {
        id: true,
        fullName: true,
        photoStorageKey: true,
      },
    });

    if (previousStorageKey) {
      const previousPath = path.join(
        process.cwd(),
        'uploads',
        previousStorageKey,
      );

      if (fs.existsSync(previousPath)) {
        try {
          fs.unlinkSync(previousPath);
        } catch {
          // Keep the database update successful even if
          // the previous file cannot be removed.
        }
      }
    }

    await logAudit({
      userId: req.employee.employeeId,
      userRole: req.employee.role,
      action: 'UPLOAD_EMPLOYEE_PHOTO',
      entity: 'Employee',
      entityId: employee.id,
      metadata: {
        targetEmployeeId: employee.id,
        storageKey,
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      },
    });

    res.json({
      message: 'Employee photo uploaded successfully',
      employee: updatedEmployee,
      photoUrl: `/uploads/${storageKey}`,
    });
  }),
);


/**
 * UPLOAD employee document
 */
router.post(
  '/:id/documents',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  employeeDocumentUpload.single('document'),
  asyncHandler(async (req: any, res: Response) => {
    const employee = await getEmployeeForAccess(
      req.params.id,
      req.employee
    );

    if (!req.file) {
      res.status(400).json({
        message: 'Employee document is required',
      });
      return;
    }

    const documentType =
      typeof req.body.documentType === 'string'
        ? req.body.documentType.trim()
        : '';

    const documentNumber =
      typeof req.body.documentNumber === 'string'
        ? req.body.documentNumber.trim()
        : null;

    if (!documentType) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // Ignore cleanup failure.
      }

      res.status(400).json({
        message: 'Document type is required',
      });
      return;
    }

    const storageKey = path
      .join('employees', 'documents', req.file.filename)
      .replace(/\\/g, '/');

    try {
      const document = await prisma.employeeDocument.create({
        data: {
          employeeId: employee.id,
          documentType,
          documentNumber: documentNumber || null,
          originalFileName: req.file.originalname,
          storageKey,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          uploadedById: req.employee.employeeId,
        },
      });

      await logAudit({
        userId: req.employee.employeeId,
        userRole: req.employee.role,
        action: 'UPLOAD_EMPLOYEE_DOCUMENT',
        entity: 'EmployeeDocument',
        entityId: document.id,
        metadata: {
          targetEmployeeId: employee.id,
          documentType,
          documentNumber: documentNumber || null,
          storageKey,
          originalFileName: req.file.originalname,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
        },
      });

      res.status(201).json({
        message: 'Employee document uploaded successfully',
        document,
        documentUrl: `/uploads/${storageKey}`,
      });
    } catch (error) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // Ignore cleanup failure.
      }

      throw error;
    }
  }),
);


/**
 * LIST employee documents
 */
router.get(
  '/:id/documents',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req: any, res: Response) => {
    const employee = await getEmployeeForAccess(
      req.params.id,
      req.employee
    );

    const documents = await prisma.employeeDocument.findMany({
      where: {
        employeeId: employee.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      employeeId: employee.id,
      documents: documents.map((document) => ({
        ...document,
        documentUrl: `/uploads/${document.storageKey}`,
      })),
    });
  }),
);


/**
 * VIEW / DOWNLOAD employee document
 */
router.get(
  '/:id/documents/:documentId',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req: any, res: Response) => {
    const employee = await getEmployeeForAccess(
      req.params.id,
      req.employee
    );

    const document = await prisma.employeeDocument.findFirst({
      where: {
        id: req.params.documentId,
        employeeId: employee.id,
      },
    });

    if (!document) {
      res.status(404).json({
        message: 'Employee document not found',
      });
      return;
    }

    const filePath = path.join(
      process.cwd(),
      'uploads',
      document.storageKey
    );

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        message: 'Employee document file not found',
      });
      return;
    }

    res.setHeader(
      'Content-Type',
      document.mimeType || 'application/octet-stream'
    );

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${document.originalFileName}"`
    );

    res.sendFile(path.resolve(filePath));
  }),
);


/**
 * DELETE employee document
 */
router.delete(
  '/:id/documents/:documentId',
  requireEmployeeAuth,
  requireRole(...MANAGEMENT_ROLES),
  asyncHandler(async (req: any, res: Response) => {
    const employee = await getEmployeeForAccess(
      req.params.id,
      req.employee
    );

    const document = await prisma.employeeDocument.findFirst({
      where: {
        id: req.params.documentId,
        employeeId: employee.id,
      },
    });

    if (!document) {
      res.status(404).json({
        message: 'Employee document not found',
      });
      return;
    }

    const filePath = path.join(
      process.cwd(),
      'uploads',
      document.storageKey
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.employeeDocument.delete({
      where: {
        id: document.id,
      },
    });

    await logAudit({
      userId: req.employee.employeeId,
      userRole: req.employee.role,
      action: 'DELETE_EMPLOYEE_DOCUMENT',
      entity: 'EmployeeDocument',
      entityId: document.id,
      metadata: {
        targetEmployeeId: employee.id,
        documentType: document.documentType,
        documentNumber: document.documentNumber,
        originalFileName: document.originalFileName,
        storageKey: document.storageKey,
      },
    });

    res.json({
      message: 'Employee document deleted successfully',
      documentId: document.id,
    });
  }),
);

export default router;








