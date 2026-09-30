import React, { useEffect, useMemo, useState } from 'react';
import { api, API_BASE_URL } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import type {
  MenuItem,
  RestaurantTableDTO,
} from '../../types';

interface Category {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
}

interface CartItem {
  item: MenuItem;
  quantity: number;
}

type OrderType = 'DINE_IN' | 'TAKEAWAY';

type PaymentMethod =
  | 'CASH'
  | 'UPI'
  | 'CARD'
  | 'OTHER';

interface CreatedOrder {
  id: string;
  orderNumber: number;
  type: string;
  status: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  tableSessionId?: string | null;
}
interface CreatedBill {
  id: string;
  billNumber: number;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  paymentStatus: string;
  tableSessionId?: string | null;
}

interface POSCoupon {
  id: string;
  code: string;
  description?: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | string;
  discountValue: string | number;
  minOrder: string | number;
  maxDiscount?: string | number | null;
  startDate: string;
  expiryDate: string;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  status: string;
  branchId?: string | null;
  branch?: {
    id: string;
    name: string;
  } | null;
}

/* =========================================================
   HELPERS
========================================================= */

const money = (value: number) =>
  `₹${value.toFixed(2)}`;

const getImageUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${apiOrigin}${url.startsWith('/') ? url : `/${url}`}`;
};

const getNumber = (value: unknown) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
};

/* =========================================================
   POS
========================================================= */

export default function POS() {
  const { employee } = useAuth();

  /* =======================================================
     DATA
  ======================================================= */

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [items, setItems] =
    useState<MenuItem[]>([]);

  const [tables, setTables] =
    useState<RestaurantTableDTO[]>([]);

  /* =======================================================
     ORDER STATE
  ======================================================= */

  const [orderType, setOrderType] =
    useState<OrderType>('DINE_IN');

  const [selectedCategory, setSelectedCategory] =
    useState('ALL');

  const [selectedTable, setSelectedTable] =
    useState<RestaurantTableDTO | null>(
      null
    );

  const [cart, setCart] =
    useState<CartItem[]>([]);

  const [search, setSearch] =
    useState('');

  const [couponCode, setCouponCode] =
    useState('');

  const [availableCoupons, setAvailableCoupons] =
    useState<POSCoupon[]>([]);

  const [couponViewOpen, setCouponViewOpen] =
    useState(false);

  const [couponLoading, setCouponLoading] =
    useState(false);

  const [couponError, setCouponError] =
    useState('');

  const [specialInstructions, setSpecialInstructions] =
    useState('');

  /* =======================================================
     ORDER RESULT
  ======================================================= */

  const [createdOrder, setCreatedOrder] =
    useState<CreatedOrder | null>(
      null
    );
  const [createdBill, setCreatedBill] =
    useState<CreatedBill | null>(null);

  const [generatingBill, setGeneratingBill] =
    useState(false);
  /* =======================================================
     PAYMENT UI
  ======================================================= */

  const [paymentOpen, setPaymentOpen] =
    useState(false);

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('CASH');

  const [paymentAmount, setPaymentAmount] =
    useState('');

  const [processingPayment, setProcessingPayment] =
    useState(false);

  /* =======================================================
     UI
  ======================================================= */

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const branchId =
    employee?.branchId;

  /* =======================================================
     LOAD POS DATA
  ======================================================= */

  useEffect(() => {
    if (!branchId) {
      setLoading(false);

      setError(
        'No branch is assigned to this employee.'
      );

      return;
    }

    const loadPOSData =
      async () => {
        try {
          setLoading(true);
          setError('');

          const [
            categoryResponse,
            itemResponse,
            tableResponse,
          ] = await Promise.all([
            api.get('/categories', {
              params: {
                branchId,
              },
            }),

            api.get('/items', {
              params: {
                branchId,
              },
            }),

            api.get('/tables', {
              params: {
                branchId,
              },
            }),
          ]);

          setCategories(
            categoryResponse.data
              .categories ?? []
          );

          setItems(
            itemResponse.data
              .items ?? []
          );

          setTables(
            tableResponse.data
              .tables ?? []
          );
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load POS data.'
          );
        } finally {
          setLoading(false);
        }
      };

    loadPOSData();
  }, [branchId]);

  /* =======================================================
     LOAD AVAILABLE COUPONS
  ======================================================= */

  const loadAvailableCoupons = async () => {
    if (!branchId) {
      setCouponError(
        'No branch is assigned to this employee.'
      );
      return;
    }

    try {
      setCouponLoading(true);
      setCouponError('');

      const response = await api.get('/coupons', {
        params: {
          branchId,
        },
      });

      const rawCoupons =
        response.data?.coupons ??
        response.data?.data?.coupons ??
        response.data ??
        [];

      const now = Date.now();

      const activeCoupons = (
        Array.isArray(rawCoupons)
          ? rawCoupons
          : []
      )
        .filter(
          (coupon: POSCoupon) =>
            coupon.status === 'ACTIVE' &&
            new Date(coupon.startDate).getTime() <=
              now &&
            new Date(coupon.expiryDate).getTime() >=
              now &&
            (!coupon.branchId ||
              coupon.branchId === branchId)
        )
        .sort((a: POSCoupon, b: POSCoupon) =>
          a.code.localeCompare(b.code)
        );

      setAvailableCoupons(activeCoupons);
      setCouponViewOpen(true);
    } catch (err) {
      setCouponError(
        err instanceof Error
          ? err.message
          : 'Unable to load available coupons.'
      );
      setAvailableCoupons([]);
      setCouponViewOpen(true);
    } finally {
      setCouponLoading(false);
    }
  };

  const selectCoupon = (coupon: POSCoupon) => {
    setCouponCode(coupon.code);
    setCouponViewOpen(false);
    setCouponError('');
    setError('');
    setSuccess(
      `Coupon ${coupon.code} selected. The backend will validate it when the order is created.`
    );
  };

  const clearCoupon = () => {
    setCouponCode('');
    setCouponError('');
    setSuccess('');
  };

  /* =======================================================
     FILTER MENU
  ======================================================= */

  const filteredItems =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return items.filter(
        (item) => {
          const matchesCategory =
            selectedCategory ===
              'ALL' ||
            item.categoryId ===
              selectedCategory;

          const matchesSearch =
            !query ||
            item.name
              .toLowerCase()
              .includes(query) ||
            Boolean(
              item.description
                ?.toLowerCase()
                .includes(query)
            );

          return (
            matchesCategory &&
            matchesSearch
          );
        }
      );
    }, [
      items,
      selectedCategory,
      search,
    ]);

  /* =======================================================
     CART TOTALS

     IMPORTANT:
     The backend is the final pricing authority.
  ======================================================= */

  const subtotal =
    useMemo(() => {
      return cart.reduce(
        (total, line) =>
          total +
          getNumber(
            line.item.price
          ) *
            line.quantity,
        0
      );
    }, [cart]);

  /*
   * Do not calculate item.discount here.
   *
   * Backend pricing currently controls
   * actual discounts and coupons.
   */
  const discount = 0;

  const tax = 0;

  const estimatedTotal =
    Math.max(
      0,
      subtotal -
        discount +
        tax
    );

  const cartCount =
    cart.reduce(
      (count, line) =>
        count +
        line.quantity,
      0
    );

  /* =======================================================
     CHANGE ORDER TYPE
  ======================================================= */

  const changeOrderType = (
    type: OrderType
  ) => {
    setOrderType(type);

    setCreatedOrder(null);
    setCreatedBill(null);
    setPaymentOpen(false);

    setError('');
    setSuccess('');

    /*
     * Takeaway has no restaurant table.
     */
    if (type === 'TAKEAWAY') {
      setSelectedTable(null);
    }
  };

  /* =======================================================
     ADD TO CART
  ======================================================= */

  const addToCart = (
    item: MenuItem
  ) => {
    setError('');
    setSuccess('');

    setCart(
      (current) => {
        const existing =
          current.find(
            (line) =>
              line.item.id ===
              item.id
          );

        if (existing) {
          return current.map(
            (line) =>
              line.item.id ===
              item.id
                ? {
                    ...line,
                    quantity:
                      line.quantity +
                      1,
                  }
                : line
          );
        }

        return [
          ...current,
          {
            item,
            quantity: 1,
          },
        ];
      }
    );
  };

  /* =======================================================
     UPDATE QUANTITY
  ======================================================= */

  const updateQuantity = (
    itemId: string,
    quantity: number
  ) => {
    if (quantity <= 0) {
      setCart(
        (current) =>
          current.filter(
            (line) =>
              line.item.id !==
              itemId
          )
      );

      return;
    }

    setCart(
      (current) =>
        current.map(
          (line) =>
            line.item.id ===
            itemId
              ? {
                  ...line,
                  quantity,
                }
              : line
        )
    );
  };

  /* =======================================================
     REMOVE ITEM
  ======================================================= */

  const removeFromCart = (
    itemId: string
  ) => {
    setCart(
      (current) =>
        current.filter(
          (line) =>
            line.item.id !==
            itemId
        )
    );
  };

  /* =======================================================
     CLEAR ORDER
  ======================================================= */

  const clearOrder = () => {
    setCart([]);
    setSelectedTable(null);
    setCouponCode('');
    setCouponViewOpen(false);
    setCouponError('');
    setSpecialInstructions('');
    setCreatedOrder(null);
    setCreatedBill(null);
    setPaymentOpen(false);
    setPaymentAmount('');
    setError('');
    setSuccess('');
  };

  /* =======================================================
     CREATE ORDER
  ======================================================= */

  const createOrder =
    async () => {
      setError('');
      setSuccess('');

      /* ---------------------------------------------------
         BRANCH
      --------------------------------------------------- */

      if (!branchId) {
        setError(
          'No branch is assigned to this employee.'
        );

        return;
      }

      /* ---------------------------------------------------
         CART
      --------------------------------------------------- */

      if (cart.length === 0) {
        setError(
          'Please add at least one item.'
        );

        return;
      }

      /* ---------------------------------------------------
         DINE-IN TABLE
      --------------------------------------------------- */

      if (
        orderType ===
          'DINE_IN' &&
        !selectedTable
      ) {
        setError(
          'Please select a table for dine-in.'
        );

        return;
      }

      /* ---------------------------------------------------
         TAKEAWAY MUST NOT HAVE TABLE
      --------------------------------------------------- */

      if (
        orderType ===
          'TAKEAWAY' &&
        selectedTable
      ) {
        setSelectedTable(null);
      }

      try {
        setSubmitting(true);

        /*
         * IMPORTANT:
         *
         * The backend receives the actual order type.
         *
         * DINE_IN:
         *   type = DINE_IN
         *   tableId = selected table
         *
         * TAKEAWAY:
         *   type = TAKEAWAY
         *   no tableId
         */

        const requestBody = {
          branchId,

          type: orderType,

          ...(orderType ===
            'DINE_IN' &&
          selectedTable
            ? {
                tableId:
                  selectedTable.id,
              }
            : {}),

          items:
            cart.map(
              (line) => ({
                itemId:
                  line.item.id,

                quantity:
                  line.quantity,
              })
            ),

          couponCode:
            couponCode.trim() ||
            undefined,

          specialInstructions:
            specialInstructions.trim() ||
            undefined,
        };

        const response =
          await api.post(
            '/orders/staff',
            requestBody
          );

        const order =
          response.data
            ?.order ??
          response.data;

        setCreatedOrder(order);
        setCreatedBill(null);
        setPaymentOpen(false);

        setSuccess(
          orderType ===
            'DINE_IN'
            ? `Order #${order.orderNumber} created successfully for Table ${selectedTable?.number}.`
            : `Takeaway Order #${order.orderNumber} created successfully.`
        );

        /*
         * Clear the cart after successful
         * order creation.
         */
        setCart([]);

        setCouponCode('');
        setCouponViewOpen(false);
        setCouponError('');
        setSpecialInstructions('');

        /*
         * Refresh table status.
         */
        if (branchId) {
          const tableResponse =
            await api.get(
              '/tables',
              {
                params: {
                  branchId,
                },
              }
            );

          setTables(
            tableResponse
              .data.tables ?? []
          );
        }

        /*
         * Keep selected table for Dine-In
         * so staff can identify the active
         * table.
         *
         * Takeaway has no table.
         */
        if (
          orderType ===
          'TAKEAWAY'
        ) {
          setSelectedTable(
            null
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to create the order.'
        );
      } finally {
        setSubmitting(false);
      }
    };
  /* =======================================================
     REFRESH ORDER STATUS
  ======================================================= */

  const refreshOrderStatus = async () => {
    if (!createdOrder) {
      setError('There is no order available to refresh.');
      return;
    }

    try {
      setError('');
      setSuccess('');

      const response = await api.get(
        `/orders/${createdOrder.id}`
      );

      const latestOrder =
        response.data?.order ??
        response.data;

      if (!latestOrder?.id) {
        throw new Error(
          'The latest order information could not be loaded.'
        );
      }

      setCreatedOrder(latestOrder);

      if (
        latestOrder.status === 'SERVED' ||
        latestOrder.status === 'COMPLETED'
      ) {
        setSuccess(
          `Order #${latestOrder.orderNumber} is ready for billing.`
        );
      } else {
        setSuccess(
          `Order #${latestOrder.orderNumber} status refreshed: ${latestOrder.status}.`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to refresh the order status.'
      );
    }
  };

  /* =======================================================
     GENERATE BILL
  ======================================================= */

  const generateBill = async () => {
    setError('');
    setSuccess('');

    if (!createdOrder) {
      setError(
        'There is no order available to generate a bill.'
      );
      return;
    }

    if (createdBill) {
      setSuccess(
        `Bill #${createdBill.billNumber} has already been generated.`
      );
      return;
    }

    if (
      createdOrder.status !== 'SERVED' &&
      createdOrder.status !== 'COMPLETED'
    ) {
      setError(
        `Order #${createdOrder.orderNumber} is currently ${createdOrder.status}. The order must be SERVED or COMPLETED before the bill can be generated.`
      );
      return;
    }

    if (
      orderType === 'DINE_IN' &&
      !createdOrder.tableSessionId
    ) {
      setError(
        'This dine-in order does not have a table session.'
      );
      return;
    }

    try {
      setGeneratingBill(true);

      const requestBody =
        orderType === 'DINE_IN'
          ? {
              tableSessionId:
                createdOrder.tableSessionId,
            }
          : {
              orderId: createdOrder.id,
            };

      const response = await api.post(
        '/bills/generate',
        requestBody
      );

      const bill =
        response.data?.bill ??
        response.data;

      if (!bill?.id) {
        throw new Error(
          'The billing service returned an invalid bill.'
        );
      }

      setCreatedBill(bill);

      setSuccess(
        `Bill #${bill.billNumber} generated successfully.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to generate the bill.'
      );
    } finally {
      setGeneratingBill(false);
    }
  };

  /* =======================================================
     PAYMENT
     
     Payment is intentionally not automatically opened here.

     The current backend bill system requires a bill/session
     workflow that happens after the kitchen/service stages.
  ======================================================= */

  const openPayment = () => {
    setError('');

    if (!createdBill) {
      setError(
        'Please generate the bill before recording payment.'
      );
      return;
    }

    if (createdBill.paymentStatus === 'PAID') {
      setError(
        `Bill #${createdBill.billNumber} is already fully paid.`
      );
      return;
    }

    const remainingAmount = getNumber(
      createdBill.total
    );

    setPaymentAmount(
      remainingAmount.toFixed(2)
    );

    setPaymentOpen(true);
  };

  /* =======================================================
     RECORD PAYMENT
  ======================================================= */

  const recordPayment = async () => {
    setError('');
    setSuccess('');

    if (!createdBill) {
      setError(
        'Please generate the bill before recording payment.'
      );
      return;
    }

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }

    try {
      setProcessingPayment(true);

      const response = await api.post(
        '/payments/record',
        {
          billId: createdBill.id,
          amount,
          method: paymentMethod,
        }
      );

      const result = response.data;

      const billStatus =
        result?.billStatus ??
        result?.bill?.paymentStatus ??
        createdBill.paymentStatus;

      const remainingAmount =
        getNumber(result?.remainingAmount);

      setCreatedBill((current) =>
        current
          ? {
              ...current,
              paymentStatus: billStatus,
            }
          : current
      );

      setPaymentOpen(false);

      if (billStatus === 'PAID') {
        setSuccess(
          `Payment received successfully for Bill #${createdBill.billNumber}. Bill is fully paid.`
        );
      } else {
        setSuccess(
          `Partial payment received. Remaining balance: ${money(
            remainingAmount
          )}.`
        );
      }

      if (branchId) {
        const tableResponse =
          await api.get('/tables', {
            params: { branchId },
          });

        setTables(
          tableResponse.data?.tables ?? []
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to record payment.'
      );
    } finally {
      setProcessingPayment(false);
    }
  };

  /* =======================================================
     PRINT
  ======================================================= */

  /* =======================================================
     ONE-PAGE RECEIPT PRINT
  ======================================================= */

  const printBill = () => {
    if (!createdBill) {
      setError(
        'Generate the bill before printing the receipt.'
      );
      return;
    }

    const orderNumber =
      createdOrder?.orderNumber ?? '-';

    const orderStatus =
      createdOrder?.status ?? '-';

    const tableNumber =
      selectedTable?.number ??
      '-';

    const receiptWindow =
      window.open(
        '',
        '_blank',
        'width=420,height=720'
      );

    if (!receiptWindow) {
      setError(
        'Unable to open the print window. Please allow pop-ups for this site.'
      );
      return;
    }

    const itemsHtml = cart.length
      ? cart
          .map((line) => {
            const quantity = line.quantity;
            const unitPrice = getNumber(
              line.item.price
            );
            const lineTotal =
              quantity * unitPrice;

            return `
              <tr>
                <td>${escapeHtml(line.item.name)}</td>
                <td class="qty">${quantity}</td>
                <td class="amount">₹${lineTotal.toFixed(2)}</td>
              </tr>
            `;
          })
          .join('')
      : `
          <tr>
            <td colspan="3" class="muted">
              Items are stored against this bill.
            </td>
          </tr>
        `;

    const subtotalValue =
      getNumber(createdBill.subtotal);

    const discountValue =
      getNumber(createdBill.discount);

    const taxValue =
      getNumber(createdBill.tax);

    const totalValue =
      getNumber(createdBill.total);

    receiptWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Bill #${createdBill.billNumber}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 4mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 0;
              width: 72mm;
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              color: #222;
              font-size: 12px;
            }

            .receipt {
              width: 100%;
            }

            .center {
              text-align: center;
            }

            .brand {
              font-size: 20px;
              font-weight: 800;
              margin-bottom: 3px;
            }

            .subtitle {
              color: #666;
              font-size: 10px;
            }

            .divider {
              border-top: 1px dashed #777;
              margin: 10px 0;
            }

            .row {
              display: flex;
              justify-content: space-between;
              gap: 10px;
              margin: 3px 0;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 6px;
            }

            th {
              text-align: left;
              font-size: 10px;
              border-bottom: 1px solid #222;
              padding-bottom: 4px;
            }

            td {
              padding: 5px 0;
              vertical-align: top;
            }

            .qty {
              width: 28px;
              text-align: center;
            }

            .amount {
              text-align: right;
              white-space: nowrap;
            }

            .summary {
              margin-top: 8px;
            }

            .total {
              font-size: 16px;
              font-weight: 800;
              margin-top: 6px;
            }

            .status {
              margin-top: 10px;
              padding: 6px;
              border: 1px solid #aaa;
              text-align: center;
              font-weight: 700;
            }

            .footer {
              margin-top: 14px;
              text-align: center;
              color: #666;
              font-size: 10px;
            }

            .muted {
              color: #777;
              text-align: center;
            }

            @media print {
              body {
                width: 72mm;
              }
            }
          </style>
        </head>

        <body>
          <main class="receipt">
            <div class="center">
              <div class="brand">SAM'S RESTAURANT</div>
              <div class="subtitle">SAM'S RMS</div>
            </div>

            <div class="divider"></div>

            <div class="row">
              <span>Bill</span>
              <strong>#${createdBill.billNumber}</strong>
            </div>

            <div class="row">
              <span>Order</span>
              <strong>#${orderNumber}</strong>
            </div>

            <div class="row">
              <span>Type</span>
              <span>${orderType === 'DINE_IN' ? 'Dine-In' : 'Takeaway'}</span>
            </div>

            ${
              orderType === 'DINE_IN'
                ? `
                  <div class="row">
                    <span>Table</span>
                    <span>${tableNumber}</span>
                  </div>
                `
                : ''
            }

            <div class="row">
              <span>Status</span>
              <span>${orderStatus}</span>
            </div>

            <div class="divider"></div>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="qty">Qty</th>
                  <th class="amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="divider"></div>

            <div class="summary">
              <div class="row">
                <span>Subtotal</span>
                <span>₹${subtotalValue.toFixed(2)}</span>
              </div>

              <div class="row">
                <span>Discount</span>
                <span>-₹${discountValue.toFixed(2)}</span>
              </div>

              <div class="row">
                <span>Tax</span>
                <span>₹${taxValue.toFixed(2)}</span>
              </div>

              <div class="divider"></div>

              <div class="row total">
                <span>TOTAL</span>
                <span>₹${totalValue.toFixed(2)}</span>
              </div>
            </div>

            <div class="status">
              ${createdBill.paymentStatus}
            </div>

            <div class="footer">
              Thank you for dining with us!
            </div>
          </main>

          <script>
            window.onload = function () {
              window.focus();
              window.print();
            };

            window.onafterprint = function () {
              window.close();
            };
          </script>
        </body>
      </html>
    `);

    receiptWindow.document.close();
  };

  /* Escape user/menu text before inserting it into the receipt HTML. */
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center">

          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-coffee/10 border-t-turmeric" />

          <p className="mt-4 text-sm font-medium text-coffee/60">
            Loading POS...
          </p>

        </div>
      </div>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="space-y-5">

      {/* ===================================================
          HEADER
      =================================================== */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

        <div>

          <div className="flex items-center gap-2">

            <span className="rounded-full bg-leaf/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-leaf">
              Point of Sale
            </span>

            <span className="text-xs text-coffee/40">
              SAM'S RMS
            </span>

          </div>

          <h1 className="mt-2 font-serif text-3xl font-bold text-coffee-dark">
            New Order
          </h1>

          <p className="mt-1 text-sm text-coffee/55">
            Create and manage restaurant orders.
          </p>

        </div>

        <div className="flex gap-3">

          <div className="rounded-2xl border border-coffee/10 bg-white px-4 py-3 shadow-sm">

            <div className="text-[10px] font-bold uppercase tracking-wider text-coffee/40">
              Cart
            </div>

            <div className="mt-1 text-sm font-bold text-coffee-dark">
              {cartCount} items
            </div>

          </div>

          <div className="rounded-2xl border border-coffee/10 bg-white px-4 py-3 shadow-sm">

            <div className="text-[10px] font-bold uppercase tracking-wider text-coffee/40">
              Order
            </div>

            <div className="mt-1 text-sm font-bold text-coffee-dark">
              {orderType ===
              'DINE_IN'
                ? 'Dine-In'
                : 'Takeaway'}
            </div>

          </div>

        </div>

      </div>

      {/* ===================================================
          ALERTS
      =================================================== */}

      {error && (
        <div className="rounded-2xl border border-chili/20 bg-chili/5 px-4 py-3 text-sm font-semibold text-chili">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-leaf/20 bg-leaf/5 px-4 py-3 text-sm font-semibold text-leaf">
          {success}
        </div>
      )}

      {/* ===================================================
          MAIN
      =================================================== */}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">

        {/* =================================================
            MENU
        ================================================= */}

        <section className="min-w-0 rounded-3xl border border-coffee/10 bg-white p-4 shadow-sm sm:p-5">

          {/* ORDER TYPE */}

          <div className="mb-5">

            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-coffee/45">
              Order Type
            </div>

            <div className="grid grid-cols-2 gap-3">

              <button
                type="button"
                onClick={() =>
                  changeOrderType(
                    'DINE_IN'
                  )
                }
                className={[
                  'rounded-2xl border p-4 text-left transition',
                  orderType ===
                  'DINE_IN'
                    ? 'border-turmeric bg-turmeric/15 shadow-sm'
                    : 'border-coffee/10 bg-cream/40 hover:border-turmeric/50',
                ].join(' ')}
              >

                <div className="text-2xl">
                  🍽️
                </div>

                <div className="mt-2 text-sm font-bold text-coffee-dark">
                  Dine-In
                </div>

                <div className="mt-1 text-xs text-coffee/50">
                  Customer is seated at a table
                </div>

              </button>

              <button
                type="button"
                onClick={() =>
                  changeOrderType(
                    'TAKEAWAY'
                  )
                }
                className={[
                  'rounded-2xl border p-4 text-left transition',
                  orderType ===
                  'TAKEAWAY'
                    ? 'border-turmeric bg-turmeric/15 shadow-sm'
                    : 'border-coffee/10 bg-cream/40 hover:border-turmeric/50',
                ].join(' ')}
              >

                <div className="text-2xl">
                  🥡
                </div>

                <div className="mt-2 text-sm font-bold text-coffee-dark">
                  Takeaway
                </div>

                <div className="mt-1 text-xs text-coffee/50">
                  Customer takes the order away
                </div>

              </button>

            </div>

          </div>

          {/* SEARCH */}

          <div className="flex flex-col gap-3 md:flex-row">

            <div className="flex h-12 flex-1 items-center gap-3 rounded-2xl border border-coffee/10 bg-cream/50 px-4">

              <span className="text-xl text-coffee/40">
                ⌕
              </span>

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target
                      .value
                  )
                }
                placeholder="Search menu items..."
                className="w-full bg-transparent text-sm text-coffee-dark outline-none placeholder:text-coffee/40"
              />

              {search && (
                <button
                  type="button"
                  onClick={() =>
                    setSearch('')
                  }
                  className="text-xs font-semibold text-coffee/40 hover:text-coffee-dark"
                >
                  Clear
                </button>
              )}

            </div>

            <div className="flex h-12 items-center justify-center rounded-2xl bg-coffee-dark px-5 text-sm font-semibold text-white">
              {filteredItems.length} items
            </div>

          </div>

          {/* CATEGORIES */}

          <div className="mt-5 flex gap-2 overflow-x-auto pb-2">

            <button
              type="button"
              onClick={() =>
                setSelectedCategory(
                  'ALL'
                )
              }
              className={[
                'whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                selectedCategory ===
                'ALL'
                  ? 'bg-turmeric text-coffee-dark'
                  : 'bg-cream text-coffee/60 hover:bg-turmeric/20',
              ].join(' ')}
            >
              All Items
            </button>

            {categories.map(
              (category) => (
                <button
                  key={
                    category.id
                  }
                  type="button"
                  onClick={() =>
                    setSelectedCategory(
                      category.id
                    )
                  }
                  className={[
                    'whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                    selectedCategory ===
                    category.id
                      ? 'bg-turmeric text-coffee-dark'
                      : 'bg-cream text-coffee/60 hover:bg-turmeric/20',
                  ].join(' ')}
                >
                  {
                    category.name
                  }
                </button>
              )
            )}

          </div>

          {/* MENU GRID */}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">

            {filteredItems.map(
              (item) => {
                const primaryImage =
                  item.images?.find(
                    (image) =>
                      image.isPrimary
                  )?.url ||
                  item.images?.[0]
                    ?.url;

                const imageUrl =
                  getImageUrl(primaryImage);

                const cartLine =
                  cart.find(
                    (line) =>
                      line.item.id ===
                      item.id
                  );

                const price =
                  getNumber(
                    item.price
                  );

                return (
                  <article
                    key={
                      item.id
                    }
                    className="group overflow-hidden rounded-2xl border border-coffee/10 bg-white transition hover:-translate-y-0.5 hover:border-turmeric/50 hover:shadow-lg"
                  >

                    <div className="relative aspect-[4/3] overflow-hidden bg-cream">

                      {primaryImage ? (
                        <img
                          src={
                            imageUrl
                          }
                          alt={
                            item.name
                          }
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">

                          <div className="text-center">

                            <div className="text-4xl">
                              🍽️
                            </div>

                            <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-coffee/30">
                              SAM'S
                            </div>

                          </div>

                        </div>
                      )}

                      {cartLine && (
                        <div className="absolute right-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full bg-turmeric px-2 text-xs font-bold text-coffee-dark shadow-lg">
                          ×
                          {
                            cartLine.quantity
                          }
                        </div>
                      )}

                    </div>

                    <div className="p-4">

                      <div className="flex items-start justify-between gap-3">

                        <h3 className="line-clamp-2 text-sm font-bold text-coffee-dark">
                          {
                            item.name
                          }
                        </h3>

                        <span className="shrink-0 text-sm font-bold text-coffee-dark">
                          {
                            money(
                              price
                            )
                          }
                        </span>

                      </div>

                      {item.description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-coffee/45">
                          {
                            item.description
                          }
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          addToCart(
                            item
                          )
                        }
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-coffee-dark px-4 py-2.5 text-sm font-bold text-white transition hover:bg-coffee"
                      >
                        <span className="text-lg">
                          +
                        </span>
                        Add to Order
                      </button>

                    </div>

                  </article>
                );
              }
            )}

          </div>

          {filteredItems.length ===
            0 && (
            <div className="flex min-h-64 items-center justify-center text-center">

              <div>

                <div className="text-4xl">
                  ⌕
                </div>

                <h3 className="mt-3 font-semibold text-coffee-dark">
                  No menu items found
                </h3>

                <p className="mt-1 text-sm text-coffee/45">
                  Try another search or category.
                </p>

              </div>

            </div>
          )}

        </section>

        {/* =================================================
            ORDER PANEL
        ================================================= */}

        <aside className="h-fit rounded-3xl border border-coffee/10 bg-white shadow-sm xl:sticky xl:top-24">

          {/* HEADER */}

          <div className="border-b border-coffee/10 p-5">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-coffee/40">
                  Current Order
                </div>

                <h2 className="mt-1 font-serif text-2xl font-bold text-coffee-dark">
                  Order Summary
                </h2>

              </div>

              {cart.length >
                0 && (
                <button
                  type="button"
                  onClick={
                    clearOrder
                  }
                  className="text-xs font-semibold text-chili hover:underline"
                >
                  Clear
                </button>
              )}

            </div>

            <div className="mt-4">

              <span className="inline-flex rounded-full bg-turmeric/15 px-3 py-1.5 text-xs font-bold text-coffee-dark">
                {orderType ===
                'DINE_IN'
                  ? '🍽️ Dine-In'
                  : '🥡 Takeaway'}
              </span>

            </div>

          </div>

          <div className="space-y-5 p-5">

            {/* TABLE */}

            {orderType ===
              'DINE_IN' && (
              <div>

                <div className="mb-2 flex items-center justify-between">

                  <label className="text-xs font-bold uppercase tracking-wider text-coffee/45">
                    Select Table
                  </label>

                  {selectedTable && (
                    <span className="text-xs font-bold text-leaf">
                      Table
                      {' '}
                      {
                        selectedTable.number
                      }
                    </span>
                  )}

                </div>

                <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">

                  {tables.map(
                    (table) => {
                      const unavailable =
                        table.status ===
                        'OUT_OF_SERVICE';

                      const selected =
                        selectedTable?.id ===
                        table.id;

                      return (
                        <button
                          key={
                            table.id
                          }
                          type="button"
                          disabled={
                            unavailable
                          }
                          onClick={() =>
                            setSelectedTable(
                              table
                            )
                          }
                          className={[
                            'rounded-xl border px-2 py-3 text-center transition',
                            unavailable
                              ? 'cursor-not-allowed border-coffee/5 bg-coffee/5 opacity-40'
                              : selected
                                ? 'border-turmeric bg-turmeric text-coffee-dark'
                                : table.status ===
                                    'AVAILABLE'
                                  ? 'border-leaf/20 bg-leaf/5 hover:border-leaf/40'
                                  : 'border-coffee/10 bg-cream text-coffee/55 hover:border-turmeric/40',
                          ].join(
                            ' '
                          )}
                        >

                          <div className="text-sm font-bold">
                            T
                            {
                              table.number
                            }
                          </div>

                          <div className="mt-1 text-[10px] uppercase">
                            {
                              table.status
                                .replace(
                                  /_/g,
                                  ' '
                                )
                            }
                          </div>

                        </button>
                      );
                    }
                  )}

                </div>

              </div>
            )}

            {/* TAKEAWAY */}

            {orderType ===
              'TAKEAWAY' && (
              <div className="rounded-2xl border border-turmeric/30 bg-turmeric/10 p-4">

                <div className="text-sm font-bold text-coffee-dark">
                  🥡 Takeaway Order
                </div>

                <p className="mt-1 text-xs leading-5 text-coffee/55">
                  No restaurant table is required.
                </p>

              </div>
            )}

            {/* CART */}

            <div>

              <div className="mb-2 flex items-center justify-between">

                <span className="text-xs font-bold uppercase tracking-wider text-coffee/45">
                  Items
                </span>

                <span className="text-xs text-coffee/40">
                  {cartCount} total
                </span>

              </div>

              {cart.length ===
              0 ? (
                <div className="rounded-2xl border border-dashed border-coffee/15 bg-cream/40 px-4 py-8 text-center">

                  <div className="text-3xl">
                    🛒
                  </div>

                  <p className="mt-2 text-sm font-semibold text-coffee-dark">
                    Your order is empty
                  </p>

                  <p className="mt-1 text-xs text-coffee/45">
                    Add items from the menu.
                  </p>

                </div>
              ) : (
                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">

                  {cart.map(
                    (line) => {
                      const lineTotal =
                        getNumber(
                          line.item.price
                        ) *
                        line.quantity;

                      return (
                        <div
                          key={
                            line.item.id
                          }
                          className="rounded-2xl border border-coffee/10 bg-cream/40 p-3"
                        >

                          <div className="flex items-start justify-between gap-3">

                            <div className="min-w-0">

                              <h3 className="truncate text-sm font-semibold text-coffee-dark">
                                {
                                  line.item
                                    .name
                                }
                              </h3>

                              <p className="mt-1 text-xs text-coffee/45">
                                {
                                  money(
                                    getNumber(
                                      line
                                        .item
                                        .price
                                    )
                                  )
                                }
                                {' '}
                                each
                              </p>

                            </div>

                            <div className="text-sm font-bold text-coffee-dark">
                              {
                                money(
                                  lineTotal
                                )
                              }
                            </div>

                          </div>

                          <div className="mt-3 flex items-center justify-between">

                            <div className="flex items-center rounded-xl border border-coffee/10 bg-white">

                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(
                                    line
                                      .item
                                      .id,
                                    line.quantity -
                                      1
                                  )
                                }
                                className="h-9 w-9 text-lg text-coffee/60 hover:text-coffee-dark"
                              >
                                −
                              </button>

                              <span className="w-8 text-center text-sm font-bold">
                                {
                                  line.quantity
                                }
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(
                                    line
                                      .item
                                      .id,
                                    line.quantity +
                                      1
                                  )
                                }
                                className="h-9 w-9 text-lg text-coffee/60 hover:text-coffee-dark"
                              >
                                +
                              </button>

                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                removeFromCart(
                                  line.item
                                    .id
                                )
                              }
                              className="text-xs font-semibold text-chili hover:underline"
                            >
                              Remove
                            </button>

                          </div>

                        </div>
                      );
                    }
                  )}

                </div>
              )}

            </div>

            {/* COUPON */}

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-xs font-bold uppercase tracking-wider text-coffee/45">
                  Coupon
                </label>

                {couponCode && (
                  <button
                    type="button"
                    onClick={clearCoupon}
                    className="text-xs font-semibold text-chili hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  value={couponCode}
                  onChange={(event) =>
                    setCouponCode(
                      event.target.value.toUpperCase()
                    )
                  }
                  placeholder="Enter coupon code"
                  className="min-w-0 flex-1 rounded-xl border border-coffee/10 bg-cream/40 px-3 py-3 text-sm uppercase text-coffee-dark outline-none focus:border-turmeric focus:ring-2 focus:ring-turmeric/20"
                />

                <button
                  type="button"
                  onClick={loadAvailableCoupons}
                  disabled={couponLoading || !branchId}
                  className={[
                    'shrink-0 rounded-xl px-4 py-3 text-xs font-bold transition',
                    couponLoading || !branchId
                      ? 'cursor-not-allowed bg-coffee/10 text-coffee/35'
                      : 'bg-coffee-dark text-white hover:bg-coffee',
                  ].join(' ')}
                >
                  {couponLoading
                    ? 'Loading...'
                    : 'View / Select'}
                </button>
              </div>

              {couponCode && (
                <div className="mt-2 rounded-xl border border-leaf/20 bg-leaf/5 px-3 py-2 text-xs font-semibold text-leaf">
                  Selected coupon: {couponCode}
                </div>
              )}

              {couponError && (
                <div className="mt-2 rounded-xl border border-chili/20 bg-chili/5 px-3 py-2 text-xs font-semibold text-chili">
                  {couponError}
                </div>
              )}

              {couponViewOpen && (
                <div className="mt-3 rounded-2xl border border-coffee/10 bg-cream/30 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-coffee-dark">
                        Available Coupons
                      </div>
                      <div className="mt-0.5 text-[11px] text-coffee/45">
                        Active coupons available for this branch
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCouponViewOpen(false)}
                      className="text-xs font-semibold text-coffee/50 hover:text-coffee-dark"
                    >
                      Close
                    </button>
                  </div>

                  {couponLoading ? (
                    <div className="rounded-xl bg-white px-3 py-4 text-center text-xs text-coffee/50">
                      Loading coupons...
                    </div>
                  ) : availableCoupons.length === 0 ? (
                    <div className="rounded-xl bg-white px-3 py-4 text-center text-xs text-coffee/50">
                      No active coupons are available for this branch.
                    </div>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {availableCoupons.map((coupon) => {
                        const discountValue = getNumber(
                          coupon.discountValue
                        );
                        const minOrder = getNumber(
                          coupon.minOrder
                        );
                        const maxDiscount =
                          coupon.maxDiscount != null
                            ? getNumber(coupon.maxDiscount)
                            : null;

                        const discountText =
                          coupon.discountType ===
                          'PERCENTAGE'
                            ? `${discountValue}% OFF`
                            : `${money(discountValue)} OFF`;

                        return (
                          <button
                            key={coupon.id}
                            type="button"
                            onClick={() =>
                              selectCoupon(coupon)
                            }
                            className="w-full rounded-xl border border-coffee/10 bg-white p-3 text-left transition hover:border-turmeric hover:bg-turmeric/10"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-bold uppercase text-coffee-dark">
                                  {coupon.code}
                                </div>

                                {coupon.description && (
                                  <div className="mt-1 text-xs text-coffee/55">
                                    {coupon.description}
                                  </div>
                                )}
                              </div>

                              <span className="shrink-0 rounded-lg bg-turmeric/20 px-2 py-1 text-[10px] font-extrabold text-coffee-dark">
                                {discountText}
                              </span>
                            </div>

                            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-coffee/50">
                              <span>
                                Min order: {money(minOrder)}
                              </span>

                              <span className="text-right">
                                {maxDiscount != null
                                  ? `Max discount: ${money(maxDiscount)}`
                                  : 'No max discount'}
                              </span>

                              <span>
                                Starts:{' '}
                                {new Date(
                                  coupon.startDate
                                ).toLocaleDateString()}
                              </span>

                              <span className="text-right">
                                Expires:{' '}
                                {new Date(
                                  coupon.expiryDate
                                ).toLocaleDateString()}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SPECIAL INSTRUCTIONS */}

            <div>

              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-coffee/45">
                Special Instructions
              </label>

              <textarea
                value={
                  specialInstructions
                }
                onChange={(event) =>
                  setSpecialInstructions(
                    event.target
                      .value
                  )
                }
                rows={3}
                placeholder="Less spicy, no onion, extra sauce..."
                className="w-full resize-none rounded-2xl border border-coffee/10 bg-cream/40 px-3 py-3 text-sm text-coffee-dark outline-none focus:border-turmeric focus:ring-2 focus:ring-turmeric/20"
              />

            </div>

            {/* TOTALS */}

            <div className="rounded-2xl bg-coffee-dark p-4 text-white">

              <div className="flex justify-between text-sm text-white/60">
                <span>
                  Subtotal
                </span>

                <span>
                  {
                    money(
                      subtotal
                    )
                  }
                </span>
              </div>

              <div className="mt-2 flex justify-between text-sm text-white/60">
                <span>
                  Discount
                </span>

                <span>
                  -{' '}
                  {
                    money(
                      discount
                    )
                  }
                </span>
              </div>

              <div className="mt-2 flex justify-between text-sm text-white/60">
                <span>
                  Tax
                </span>

                <span>
                  {
                    money(
                      tax
                    )
                  }
                </span>
              </div>

              <div className="my-4 border-t border-white/10" />

              <div className="flex items-end justify-between">

                <div>

                  <div className="text-xs font-semibold uppercase tracking-wider text-white/45">
                    Estimated Total
                  </div>

                  <div className="mt-1 font-serif text-3xl font-bold">
                    {
                      money(
                        estimatedTotal
                      )
                    }
                  </div>

                </div>

                <div className="rounded-xl bg-turmeric px-3 py-2 text-xs font-bold text-coffee-dark">
                  {cartCount}
                  {' '}
                  items
                </div>

              </div>

            </div>

            {/* CREATE ORDER */}

            <button
              type="button"
              disabled={
                submitting ||
                cart.length ===
                  0 ||
                (orderType ===
                  'DINE_IN' &&
                  !selectedTable)
              }
              onClick={
                createOrder
              }
              className={[
                'flex w-full items-center justify-center rounded-2xl px-5 py-4 text-sm font-bold transition',
                submitting ||
                cart.length ===
                  0 ||
                (orderType ===
                  'DINE_IN' &&
                  !selectedTable)
                  ? 'cursor-not-allowed bg-coffee/10 text-coffee/35'
                  : 'bg-turmeric text-coffee-dark shadow-lg hover:bg-turmeric-deep',
              ].join(' ')}
            >
              {submitting
                ? 'Creating Order...'
                : orderType ===
                    'TAKEAWAY'
                  ? 'Create Takeaway Order'
                  : 'Create Dine-In Order'}
            </button>

            {/* SUCCESS ACTIONS */}

            {createdOrder && (
              <div className="rounded-2xl border border-leaf/20 bg-leaf/5 p-4">

                <div className="text-xs font-bold uppercase tracking-wider text-leaf">
                  Order Created
                </div>

                <div className="mt-1 text-lg font-bold text-coffee-dark">
                  Order #
                  {
                    createdOrder.orderNumber
                  }
                </div>

                <div className="mt-1 text-xs text-coffee/50">
                  Status:
                  {' '}
                  {
                    createdOrder.status
                  }
                </div>

                <div className="mt-4 space-y-2">

                  {!createdBill && (
                    <>
                      <button
                        type="button"
                        onClick={
                          refreshOrderStatus
                        }
                        className="w-full rounded-xl border border-coffee/10 bg-white px-3 py-3 text-xs font-bold text-coffee-dark hover:bg-cream"
                      >
                        🔄 Refresh Order Status
                      </button>

                      <button
                        type="button"
                        onClick={
                          generateBill
                        }
                        disabled={
                          generatingBill ||
                          (
                            createdOrder.status !==
                              'SERVED' &&
                            createdOrder.status !==
                              'COMPLETED'
                          )
                        }
                        className={[
                          'w-full rounded-xl px-3 py-3 text-xs font-bold transition',
                          generatingBill ||
                          (
                            createdOrder.status !==
                              'SERVED' &&
                            createdOrder.status !==
                              'COMPLETED'
                          )
                            ? 'cursor-not-allowed bg-coffee/10 text-coffee/35'
                            : 'bg-turmeric text-coffee-dark hover:bg-turmeric-deep',
                        ].join(' ')}
                      >
                        {generatingBill
                          ? 'Generating Bill...'
                          : '🧾 Generate Bill'}
                      </button>

                      <div className="rounded-xl bg-coffee/5 px-3 py-2 text-center text-[11px] leading-5 text-coffee/55">
                        Bill generation becomes available after the order is SERVED or COMPLETED.
                      </div>
                    </>
                  )}

                  {createdBill && (
                    <>
                      <div className="rounded-xl border border-leaf/20 bg-leaf/5 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-leaf">
                          Bill Generated
                        </div>

                        <div className="mt-1 text-sm font-bold text-coffee-dark">
                          Bill #{createdBill.billNumber}
                        </div>

                        <div className="mt-1 text-xs text-coffee/55">
                          Total: {money(
                            getNumber(createdBill.total)
                          )}
                        </div>

                        <div className="mt-1 text-xs font-semibold text-coffee/55">
                          Payment: {createdBill.paymentStatus}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={printBill}
                          className="rounded-xl border border-coffee/10 bg-white px-3 py-3 text-xs font-bold text-coffee-dark hover:bg-cream"
                        >
                          🖨️ Print Bill
                        </button>

                        {createdBill.paymentStatus !== 'PAID' && (
                          <button
                            type="button"
                            onClick={openPayment}
                            className="rounded-xl bg-coffee-dark px-3 py-3 text-xs font-bold text-white hover:bg-coffee"
                          >
                            💳 Payment
                          </button>
                        )}
                      </div>
                    </>
                  )}

                </div>

              </div>
            )}

          </div>

        </aside>

      </div>

      {/* ===================================================
          PAYMENT MODAL
      =================================================== */}

      {paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-coffee-dark/60 p-4 backdrop-blur-sm">

          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-coffee/10 p-6">

              <div>

                <div className="text-[10px] font-bold uppercase tracking-widest text-coffee/40">
                  Payment
                </div>

                <h2 className="mt-1 font-serif text-2xl font-bold text-coffee-dark">
                  Complete Payment
                </h2>

              </div>

              <button
                type="button"
                onClick={() =>
                  setPaymentOpen(
                    false
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-full bg-cream text-coffee/60"
              >
                ×
              </button>

            </div>

            <div className="space-y-5 p-6">

              <div className="rounded-2xl bg-coffee-dark p-5 text-white">

                <div className="text-xs uppercase tracking-wider text-white/45">
                  Bill
                </div>

                <div className="mt-1 text-xl font-bold">
                  #
                  {
                    createdBill
                      ?.billNumber
                  }
                </div>

                <div className="mt-4 text-xs uppercase tracking-wider text-white/45">
                  Amount
                </div>

                <div className="mt-1 font-serif text-3xl font-bold">
                  {
                    money(
                      getNumber(
                        createdBill
                          ?.total
                      )
                    )
                  }
                </div>

              </div>

              <div>

                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-coffee/45">
                  Payment Method
                </label>

                <div className="grid grid-cols-2 gap-2">

                  {(
                    [
                      [
                        'CASH',
                        '💵 Cash',
                      ],
                      [
                        'UPI',
                        '📱 UPI',
                      ],
                      [
                        'CARD',
                        '💳 Card',
                      ],
                      [
                        'OTHER',
                        'Other',
                      ],
                    ] as [
                      PaymentMethod,
                      string
                    ][]
                  ).map(
                    ([
                      method,
                      label,
                    ]) => (
                      <button
                        key={
                          method
                        }
                        type="button"
                        onClick={() =>
                          setPaymentMethod(
                            method
                          )
                        }
                        className={[
                          'rounded-xl border px-3 py-3 text-sm font-bold',
                          paymentMethod ===
                          method
                            ? 'border-turmeric bg-turmeric/20'
                            : 'border-coffee/10 bg-cream/40',
                        ].join(
                          ' '
                        )}
                      >
                        {label}
                      </button>
                    )
                  )}

                </div>

              </div>

              <div>

                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-coffee/45">
                  Amount
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    paymentAmount
                  }
                  onChange={(event) =>
                    setPaymentAmount(
                      event.target
                        .value
                    )
                  }
                  className="w-full rounded-xl border border-coffee/10 bg-cream/40 px-4 py-3 text-lg font-bold text-coffee-dark outline-none focus:border-turmeric"
                />

              </div>

              <div className="rounded-xl bg-turmeric/10 p-3 text-xs text-coffee/60">
                The bill must be generated through the restaurant billing workflow before a payment can be recorded.
              </div>

              <div className="grid grid-cols-2 gap-3">

                <button
                  type="button"
                  onClick={
                    printBill
                  }
                  className="rounded-xl border border-coffee/10 bg-cream px-4 py-3 text-sm font-bold text-coffee-dark"
                >
                  🖨️ Print
                </button>

                <button
                  type="button"
                  disabled={
                    processingPayment
                  }
                  onClick={
                    recordPayment
                  }
                  className="rounded-xl bg-turmeric px-4 py-3 text-sm font-bold text-coffee-dark"
                >
                  {processingPayment
                    ? 'Processing...'
                    : 'Confirm Payment'}
                </button>

              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}