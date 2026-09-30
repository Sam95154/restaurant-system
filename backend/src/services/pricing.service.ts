import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';

export type CartLineInput = { itemId: string; quantity: number };

export type PricedLine = {
  itemId: string;
  nameSnapshot: string;
  priceSnapshot: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
};

/**
 * Recalculates order pricing entirely from the database (spec sections 47/52).
 * The frontend only ever sends { itemId, quantity } pairs and a coupon code -
 * never a price or a total. This is the single source of truth for what an
 * order costs.
 */
export async function priceCart(branchId: string, lines: CartLineInput[]) {
  if (lines.length === 0) throw new AppError('Cart is empty.', 400);

  const itemIds = lines.map((l) => l.itemId);
  const items = await prisma.item.findMany({ where: { id: { in: itemIds }, branchId } });

  const pricedLines: PricedLine[] = lines.map((line) => {
    const item = items.find((i: any) => i.id === line.itemId);
    if (!item) throw new AppError('One of the items in your cart is not available at this branch.', 400);
    if (item.status !== 'ACTIVE') throw new AppError(`"${item.name}" is currently unavailable.`, 400);
    if (line.quantity <= 0) throw new AppError('Quantity must be at least 1.', 400);

    const lineTotal = item.price.mul(line.quantity);
    return {
      itemId: item.id,
      nameSnapshot: item.name,
      priceSnapshot: item.price,
      quantity: line.quantity,
      lineTotal,
    };
  });

  const subtotal = pricedLines.reduce((sum, l) => sum.add(l.lineTotal), new Prisma.Decimal(0));
  return { pricedLines, subtotal };
}

/**
 * Validates and prices a coupon against the backend record - never trusts a
 * discount amount sent by the client (spec section 53).
 */
export async function priceCoupon(code: string, branchId: string, subtotal: Prisma.Decimal, customerId?: string) {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || coupon.status !== 'ACTIVE') throw new AppError('Coupon has expired or is not valid.', 400);
  if (coupon.branchId && coupon.branchId !== branchId) throw new AppError('Coupon is not valid for this branch.', 400);

  const now = new Date();
  if (now < coupon.startDate || now > coupon.expiryDate) throw new AppError('Coupon has expired.', 400);
  if (subtotal.lt(coupon.minOrder)) {
    throw new AppError(`Minimum order for this coupon is ${coupon.minOrder.toString()}.`, 400);
  }

  if (coupon.usageLimit != null) {
    const totalUses = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
    if (totalUses >= coupon.usageLimit) throw new AppError('This coupon has reached its usage limit.', 400);
  }
  if (coupon.perCustomerLimit != null && customerId) {
    const customerUses = await prisma.couponUsage.count({ where: { couponId: coupon.id, customerId } });
    if (customerUses >= coupon.perCustomerLimit) throw new AppError('You have already used this coupon.', 400);
  }

  let discount =
    coupon.discountType === 'PERCENTAGE'
      ? subtotal.mul(coupon.discountValue).div(100)
      : coupon.discountValue;

  if (coupon.maxDiscount != null && discount.gt(coupon.maxDiscount)) {
    discount = coupon.maxDiscount;
  }
  if (discount.gt(subtotal)) discount = subtotal;

  return { coupon, discount };
}
