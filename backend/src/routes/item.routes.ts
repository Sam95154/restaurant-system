import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import {
  requireEmployeeAuth,
  optionalAuth,
} from '../middleware/auth';
import {
  requireBranchAccess,
  requireRole,
} from '../middleware/rbac';
import { logAudit } from '../services/audit.service';
import { NotFoundError } from '../utils/errors';
import { menuImageUpload } from '../middleware/upload';
const router = Router();

/* =========================================================
   VALIDATION
========================================================= */

const uuidSchema = z.string().uuid();

const itemCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Item name is required.')
    .max(150, 'Item name is too long.'),

  description: z
    .string()
    .trim()
    .max(1000, 'Description is too long.')
    .optional()
    .nullable(),

  price: z
    .number()
    .finite()
    .positive('Price must be greater than zero.'),

  discount: z
    .number()
    .finite()
    .min(0, 'Discount cannot be negative.')
    .default(0),

  ingredients: z
    .string()
    .trim()
    .max(2000, 'Ingredients are too long.')
    .optional()
    .nullable(),

  preparationTime: z
    .number()
    .int()
    .positive('Preparation time must be greater than zero.')
    .optional()
    .nullable(),

  categoryId: uuidSchema,

  branchId: uuidSchema,

  images: z
    .array(z.string().url())
    .max(10, 'Maximum 10 images are allowed.')
    .optional(),
});

const itemUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Item name is required.')
    .max(150, 'Item name is too long.')
    .optional(),

  description: z
    .string()
    .trim()
    .max(1000, 'Description is too long.')
    .optional()
    .nullable(),

  price: z
    .number()
    .finite()
    .positive()
    .optional(),

  discount: z
    .number()
    .finite()
    .min(0)
    .optional(),

  ingredients: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable(),

  preparationTime: z
    .number()
    .int()
    .positive()
    .optional()
    .nullable(),

  categoryId: uuidSchema.optional(),
});
/* =========================================================
   UPLOAD MENU ITEM IMAGE
========================================================= */

router.post(
  '/:id/images/upload',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const itemId = uuidSchema.parse(req.params.id);

    /*
     * Verify the menu item exists and get its branch.
     */
    const item = await prisma.item.findUnique({
      where: {
        id: itemId,
      },
      select: {
        id: true,
        branchId: true,
      },
    });

    if (!item) {
      throw new NotFoundError('Item not found.');
    }

    /*
     * Branch security.
     */
    if (
      req.employee!.role !== 'SUPER_ADMIN' &&
      req.employee!.branchId !== item.branchId
    ) {
      return res.status(403).json({
        error: 'You do not have access to this branch.',
      });
    }

    /*
     * Accept up to 10 images in one request.
     */
    menuImageUpload.array('images', 10)(
      req,
      res,
      async (uploadError) => {
        if (uploadError) {
          return res.status(400).json({
            error:
              uploadError instanceof Error
                ? uploadError.message
                : 'Image upload failed.',
          });
        }

        const files = req.files as Express.Multer.File[] | undefined;

        if (!files || files.length === 0) {
          return res.status(400).json({
            error: 'Please select at least one image.',
          });
        }

        /*
         * Check existing image count.
         */
        const existingImageCount =
          await prisma.itemImage.count({
            where: {
              itemId,
            },
          });

        if (existingImageCount + files.length > 10) {
          return res.status(400).json({
            error:
              'Maximum 10 images are allowed per menu item.',
          });
        }

        /*
         * The first uploaded image becomes primary only
         * when the item currently has no images.
         */
        const shouldMakeFirstPrimary =
          existingImageCount === 0;

        const images = [];

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];

          const imageUrl =
            `/uploads/menu/${file.filename}`;

          const image =
            await prisma.itemImage.create({
              data: {
                itemId,
                url: imageUrl,
                isPrimary:
                  shouldMakeFirstPrimary && index === 0,
              },
            });

          images.push(image);
        }

        await logAudit({
          userId: req.employee!.employeeId,
          action: 'UPLOAD_ITEM_IMAGES',
          entity: 'Item',
          entityId: item.id,
          metadata: {
            imageCount: images.length,
          },
        });

        return res.status(201).json({
          message: 'Menu images uploaded successfully.',
          images,
        });
      },
    );
  }),
);
const imageSchema = z.object({
  url: z.string().url('Image URL must be valid.'),
  isPrimary: z.boolean().optional().default(false),
});

/* =========================================================
   CUSTOMER / STAFF MENU BROWSE
========================================================= */

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const branchId = uuidSchema.parse(req.query.branchId);

    const categoryId = req.query.categoryId
      ? uuidSchema.parse(req.query.categoryId)
      : undefined;

    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim()
        : undefined;

    const branch = await prisma.branch.findUnique({
      where: {
        id: branchId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!branch) {
      return res.status(404).json({
        error: 'Branch not found.',
      });
    }

    /*
     * Customer requests can only browse branches that are
     * available for ordering.
     *
     * Staff requests are allowed to view the branch menu
     * for management purposes.
     */
    if (
      !req.employee &&
      branch.status !== 'OPEN' &&
      branch.status !== 'TEMPORARILY_CLOSED'
    ) {
      return res.status(400).json({
        error: 'Menu is not currently available for this branch.',
      });
    }

    /*
     * Staff must only access their assigned branch.
     * SUPER_ADMIN can access all branches.
     */
    if (req.employee && req.employee.role !== 'SUPER_ADMIN') {
      if (req.employee.branchId !== branchId) {
        return res.status(403).json({
          error: 'You do not have access to this branch.',
        });
      }
    }

    const items = await prisma.item.findMany({
      where: {
        branchId,
        categoryId,

        /*
         * Customers only see active items.
         * Staff can see active + inactive items.
         */
        status: req.employee ? undefined : 'ACTIVE',

        name: search
          ? {
              contains: search,
              mode: 'insensitive',
            }
          : undefined,
      },

      include: {
        images: true,
        category: true,
      },

      orderBy: {
        name: 'asc',
      },
    });

    return res.json({
      items,
    });
  }),
);

/* =========================================================
   GET SINGLE ITEM
========================================================= */

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const itemId = uuidSchema.parse(req.params.id);

    const item = await prisma.item.findUnique({
      where: {
        id: itemId,
      },
      include: {
        images: true,
        category: true,
      },
    });

    if (!item) {
      throw new NotFoundError('Item not found.');
    }

    /*
     * Customer must only see active items.
     */
    if (!req.employee && item.status !== 'ACTIVE') {
      throw new NotFoundError('Item not found.');
    }

    /*
     * Staff branch security.
     */
    if (
      req.employee &&
      req.employee.role !== 'SUPER_ADMIN' &&
      req.employee.branchId !== item.branchId
    ) {
      return res.status(403).json({
        error: 'You do not have access to this branch.',
      });
    }

    return res.json({
      item,
    });
  }),
);

/* =========================================================
   CREATE MENU ITEM
========================================================= */

router.post(
  '/',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  requireBranchAccess((req) => req.body?.branchId),
  asyncHandler(async (req, res) => {
    const data = itemCreateSchema.parse(req.body);

    /*
     * Verify branch exists.
     */
    const branch = await prisma.branch.findUnique({
      where: {
        id: data.branchId,
      },
      select: {
        id: true,
      },
    });

    if (!branch) {
      return res.status(404).json({
        error: 'Branch not found.',
      });
    }

    /*
     * Verify category exists and belongs to the same branch.
     */
    const category = await prisma.category.findUnique({
      where: {
        id: data.categoryId,
      },
      select: {
        id: true,
        branchId: true,
        status: true,
      },
    });

    if (!category) {
      return res.status(404).json({
        error: 'Category not found.',
      });
    }

    if (category.branchId !== data.branchId) {
      return res.status(400).json({
        error: 'Category does not belong to the selected branch.',
      });
    }

    if (category.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Cannot add an item to an inactive category.',
      });
    }

    /*
     * Prevent duplicate item names within the same branch.
     */
    const duplicate = await prisma.item.findFirst({
      where: {
        branchId: data.branchId,
        name: {
          equals: data.name,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      return res.status(409).json({
        error:
          'A menu item with this name already exists in this branch.',
      });
    }

    /*
     * Validate discount.
     *
     * This system currently stores discount as an amount/value.
     * Do not allow a discount greater than the item price.
     */
    if (data.discount > data.price) {
      return res.status(400).json({
        error: 'Discount cannot be greater than the item price.',
      });
    }

    const item = await prisma.item.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        price: data.price,
        discount: data.discount,
        ingredients: data.ingredients ?? null,
        preparationTime: data.preparationTime ?? null,
        categoryId: data.categoryId,
        branchId: data.branchId,

        images: data.images?.length
          ? {
              create: data.images.map((url, index) => ({
                url,
                isPrimary: index === 0,
              })),
            }
          : undefined,
      },

      include: {
        images: true,
        category: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'CREATE_ITEM',
      entity: 'Item',
      entityId: item.id,
    });

    return res.status(201).json({
      item,
    });
  }),
);

/* =========================================================
   UPDATE MENU ITEM
========================================================= */

router.put(
  '/:id',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const itemId = uuidSchema.parse(req.params.id);

    const data = itemUpdateSchema.parse(req.body);

    const existing = await prisma.item.findUnique({
      where: {
        id: itemId,
      },
      select: {
        id: true,
        name: true,
        price: true,
        discount: true,
        branchId: true,
        categoryId: true,
      },
    });

    if (!existing) {
      throw new NotFoundError('Item not found.');
    }

    /*
     * Branch security comes from the actual database item.
     */
    if (
      req.employee!.role !== 'SUPER_ADMIN' &&
      req.employee!.branchId !== existing.branchId
    ) {
      return res.status(403).json({
        error: 'You do not have access to this branch.',
      });
    }

    /*
     * If category is changed, verify the new category belongs
     * to the same branch and is active.
     */
    if (data.categoryId) {
      const category = await prisma.category.findUnique({
        where: {
          id: data.categoryId,
        },
        select: {
          id: true,
          branchId: true,
          status: true,
        },
      });

      if (!category) {
        return res.status(404).json({
          error: 'Category not found.',
        });
      }

      if (category.branchId !== existing.branchId) {
        return res.status(400).json({
          error:
            'Category does not belong to the item branch.',
        });
      }

      if (category.status !== 'ACTIVE') {
        return res.status(400).json({
          error:
            'Cannot assign an item to an inactive category.',
        });
      }
    }

    /*
     * Prevent duplicate names.
     */
    if (data.name) {
      const duplicate = await prisma.item.findFirst({
        where: {
          branchId: existing.branchId,
          id: {
            not: existing.id,
          },
          name: {
            equals: data.name,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        return res.status(409).json({
          error:
            'A menu item with this name already exists in this branch.',
        });
      }
    }

    const finalPrice =
      data.price !== undefined
        ? data.price
        : Number(existing.price);

    const finalDiscount =
      data.discount !== undefined
        ? data.discount
        : Number(existing.discount);

    if (finalDiscount > finalPrice) {
      return res.status(400).json({
        error:
          'Discount cannot be greater than the item price.',
      });
    }

    /*
     * IMPORTANT:
     *
     * Updating a menu item's price does NOT modify old
     * OrderItem records. Historical orders keep their
     * original charged price.
     */
    const item = await prisma.item.update({
      where: {
        id: existing.id,
      },

      data: {
        ...(data.name !== undefined
          ? { name: data.name }
          : {}),

        ...(data.description !== undefined
          ? { description: data.description }
          : {}),

        ...(data.price !== undefined
          ? { price: data.price }
          : {}),

        ...(data.discount !== undefined
          ? { discount: data.discount }
          : {}),

        ...(data.ingredients !== undefined
          ? { ingredients: data.ingredients }
          : {}),

        ...(data.preparationTime !== undefined
          ? { preparationTime: data.preparationTime }
          : {}),

        ...(data.categoryId !== undefined
          ? { categoryId: data.categoryId }
          : {}),
      },

      include: {
        images: true,
        category: true,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'UPDATE_ITEM',
      entity: 'Item',
      entityId: item.id,
      metadata: data,
    });

    return res.json({
      item,
    });
  }),
);

/* =========================================================
   ACTIVATE / DEACTIVATE
========================================================= */

router.patch(
  '/:id/status',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const itemId = uuidSchema.parse(req.params.id);

    const status = z
      .enum(['ACTIVE', 'INACTIVE'])
      .parse(req.body?.status);

    const existing = await prisma.item.findUnique({
      where: {
        id: itemId,
      },
      select: {
        id: true,
        branchId: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundError('Item not found.');
    }

    if (
      req.employee!.role !== 'SUPER_ADMIN' &&
      req.employee!.branchId !== existing.branchId
    ) {
      return res.status(403).json({
        error: 'You do not have access to this branch.',
      });
    }

    if (existing.status === status) {
      return res.json({
        message: `Item is already ${status.toLowerCase()}.`,
        item: existing,
      });
    }

    const item = await prisma.item.update({
      where: {
        id: itemId,
      },
      data: {
        status,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action:
        status === 'ACTIVE'
          ? 'ACTIVATE_ITEM'
          : 'DEACTIVATE_ITEM',
      entity: 'Item',
      entityId: item.id,
    });

    return res.json({
      item,
    });
  }),
);

/* =========================================================
   ADD IMAGE
========================================================= */

router.post(
  '/:id/images',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const itemId = uuidSchema.parse(req.params.id);

    const { url, isPrimary } = imageSchema.parse(req.body);

    const item = await prisma.item.findUnique({
      where: {
        id: itemId,
      },
      select: {
        id: true,
        branchId: true,
      },
    });

    if (!item) {
      throw new NotFoundError('Item not found.');
    }

    if (
      req.employee!.role !== 'SUPER_ADMIN' &&
      req.employee!.branchId !== item.branchId
    ) {
      return res.status(403).json({
        error: 'You do not have access to this branch.',
      });
    }

    const imageCount = await prisma.itemImage.count({
      where: {
        itemId,
      },
    });

    if (imageCount >= 10) {
      return res.status(400).json({
        error: 'Maximum 10 images are allowed per menu item.',
      });
    }

    /*
     * If this is the first image, automatically make it primary.
     */
    const makePrimary = isPrimary || imageCount === 0;

    /*
     * Only one primary image is allowed.
     */
    if (makePrimary) {
      await prisma.itemImage.updateMany({
        where: {
          itemId,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    const image = await prisma.itemImage.create({
      data: {
        itemId,
        url,
        isPrimary: makePrimary,
      },
    });

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'ADD_ITEM_IMAGE',
      entity: 'ItemImage',
      entityId: image.id,
    });

    return res.status(201).json({
      image,
    });
  }),
);

/* =========================================================
   SET PRIMARY IMAGE
========================================================= */

router.patch(
  '/images/:imageId/primary',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const imageId = uuidSchema.parse(req.params.imageId);

    const image = await prisma.itemImage.findUnique({
      where: {
        id: imageId,
      },
      select: {
        id: true,
        itemId: true,
        item: {
          select: {
            branchId: true,
          },
        },
      },
    });

    if (!image) {
      return res.status(404).json({
        error: 'Image not found.',
      });
    }

    if (
      req.employee!.role !== 'SUPER_ADMIN' &&
      req.employee!.branchId !== image.item.branchId
    ) {
      return res.status(403).json({
        error: 'You do not have access to this branch.',
      });
    }

    await prisma.$transaction([
      prisma.itemImage.updateMany({
        where: {
          itemId: image.itemId,
        },
        data: {
          isPrimary: false,
        },
      }),

      prisma.itemImage.update({
        where: {
          id: image.id,
        },
        data: {
          isPrimary: true,
        },
      }),
    ]);

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'SET_PRIMARY_ITEM_IMAGE',
      entity: 'ItemImage',
      entityId: image.id,
    });

    return res.json({
      ok: true,
    });
  }),
);

/* =========================================================
   DELETE IMAGE
========================================================= */

router.delete(
  '/images/:imageId',
  requireEmployeeAuth,
  requireRole('SUPER_ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const imageId = uuidSchema.parse(req.params.imageId);

    const image = await prisma.itemImage.findUnique({
      where: {
        id: imageId,
      },
      select: {
        id: true,
        itemId: true,
        url: true,
        isPrimary: true,
        item: {
          select: {
            branchId: true,
          },
        },
      },
    });

    if (!image) {
      return res.status(404).json({
        error: 'Image not found.',
      });
    }

    if (
      req.employee!.role !== 'SUPER_ADMIN' &&
      req.employee!.branchId !== image.item.branchId
    ) {
      return res.status(403).json({
        error: 'You do not have access to this branch.',
      });
    }

    await prisma.itemImage.delete({
      where: {
        id: image.id,
      },
    });

    /*
     * If the primary image was deleted, automatically promote
     * another remaining image.
     */
    if (image.isPrimary) {
      const nextImage = await prisma.itemImage.findFirst({
        where: {
          itemId: image.itemId,
        },
        orderBy: {
          id: 'asc',
        },
      });

      if (nextImage) {
        await prisma.itemImage.update({
          where: {
            id: nextImage.id,
          },
          data: {
            isPrimary: true,
          },
        });
      }
    }

    await logAudit({
      userId: req.employee!.employeeId,
      action: 'DELETE_ITEM_IMAGE',
      entity: 'ItemImage',
      entityId: image.id,
    });

    return res.json({
      ok: true,
    });
  }),
);

export default router;