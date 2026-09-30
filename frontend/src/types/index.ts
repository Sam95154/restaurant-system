export type EmployeeRole = 'SUPER_ADMIN' | 'MANAGER' | 'SERVICE_EMPLOYEE' | 'KITCHEN_EMPLOYEE' | 'BILLING_EMPLOYEE';

export interface Employee {
  id: string;
  fullName: string;
  role: EmployeeRole;
  branchId: string | null;
}

export interface Customer {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
}

// NOTE: the original file declared MenuItem twice (TypeScript merged the two
// declarations). They are combined here into one identical definition.
export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  discount: string;
  status: 'ACTIVE' | 'INACTIVE';
  categoryId: string;
  images: {
    id: string;
    url: string;
    isPrimary: boolean;
  }[];
}

export interface RestaurantTableDTO {
  id: string;
  number: number;
  capacity: number;
  status: string;
  branchId: string;
}

export interface OrderItemDTO {
  id: string;
  nameSnapshot: string;
  priceSnapshot: string;
  quantity: number;
}

export interface OrderDTO {
  id: string;
  orderNumber: number;
  status: string;
  type: string;
  subtotal: string;
  discountAmount: string;
  // Added (optional) so the customer tracking screen can show tax when the
  // backend sends it. Existing code that ignores it is unaffected.
  taxAmount?: string | number;
  total: string;
  items: OrderItemDTO[];
}

/* ------------------------------------------------------------------ */
/* Customer QR ordering (CustomerOrder.tsx)                            */
/* All additions below are new exports; nothing above was removed.     */
/* ------------------------------------------------------------------ */

export interface PublicBranchDTO {
  id: string;
  name: string;
  address: string;
  status: string;
  logoUrl?: string | null;
}

export interface MenuCategoryDTO {
  id: string;
  name: string;
}

// GET /tables/public/:tableId
export interface PublicTableResponse {
  table: RestaurantTableDTO & {
    branch?: PublicBranchDTO;
  };
}

// POST /orders/qr
export interface PlaceQrOrderResponse {
  order: OrderDTO;
  qrToken?: string;
}

export interface CustomerBillOrderItemDTO {
  id: string;
  nameSnapshot: string;
  priceSnapshot: string | number;
  quantity: number;
}

export interface CustomerBillItemDTO {
  id: string;
  orderId: string;
  order?: {
    id: string;
    orderNumber: number;
    type: string;
    status: string;
    subtotal: string | number;
    discountAmount: string | number;
    taxAmount: string | number;
    total: string | number;
    items?: CustomerBillOrderItemDTO[];
    tableSession?: {
      table?: {
        number: number;
      } | null;
    } | null;
  };
}

// GET /bills/qr/:qrToken  (and the `bill.created` socket event)
export interface CustomerBillDTO {
  id: string;
  billNumber: number;
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: string | number;
  paymentStatus: string;
  createdAt?: string;
  items: CustomerBillItemDTO[];
}