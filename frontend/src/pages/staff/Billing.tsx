import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { getSocket } from '../../api/socket';

type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'OTHER';

type Payment = {
  id: string;
  amount: number | string;
  method: PaymentMethod;
  recordedAt: string;
};

type OrderItem = {
  id: string;
  quantity: number;
  nameSnapshot: string;
  priceSnapshot?: number | string;
};

type OrderSummary = {
  id: string;
  orderNumber: number;
  type: string;
  status: string;
  branchId?: string;
  customerId?: string | null;
  subtotal?: number | string;
  discountAmount?: number | string;
  taxAmount?: number | string;
  total?: number | string;
  items?: OrderItem[];
  tableSession?: {
    table?: {
      number?: number;
    };
  } | null;
};

type Bill = {
  id: string;
  billNumber: number;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
  createdAt: string;
  items?: {
    id: string;
    orderId: string;
    order?: OrderSummary;
  }[];
  payments?: Payment[];
  tableSession?: {
    table?: {
      number?: number;
    };
  } | null;
};

type OrderWithBilling = OrderSummary & {
  bill?: Bill | null;
};

const PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'UPI',
  'CARD',
  'OTHER',
];

function money(value: number | string | undefined | null) {
  const amount = Number(value ?? 0);

  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function numberValue(value: number | string | undefined | null) {
  return Number(value ?? 0);
}

function paymentTotal(bill: Bill) {
  return (
    bill.payments?.reduce(
      (sum, payment) => sum + numberValue(payment.amount),
      0,
    ) ?? 0
  );
}

function remainingAmount(bill: Bill) {
  return Math.max(
    0,
    numberValue(bill.total) - paymentTotal(bill),
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

function statusClass(status: string) {
  switch (status) {
    case 'PAID':
      return 'bg-green-100 text-green-700';

    case 'PARTIALLY_PAID':
      return 'bg-yellow-100 text-yellow-700';

    case 'REFUNDED':
      return 'bg-red-100 text-red-700';

    case 'UNPAID':
      return 'bg-orange-100 text-orange-700';

    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default function Billing() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [orders, setOrders] = useState<OrderWithBilling[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'ORDERS' | 'BILLS'
  >('OVERVIEW');

  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('CASH');

  const [generatingOrderId, setGeneratingOrderId] =
    useState<string | null>(null);

  const [recordingPayment, setRecordingPayment] =
    useState(false);

  const [printing, setPrinting] = useState(false);

  const loadBills = useCallback(async () => {
    const response = await api.get('/bills');

    return (response.data?.bills ?? []) as Bill[];
  }, []);

  const loadOrders = useCallback(async () => {
    const response = await api.get('/orders');

    return (response.data?.orders ?? []) as OrderWithBilling[];
  }, []);

  const load = useCallback(
    async (showRefreshState = false) => {
      try {
        if (showRefreshState) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError('');

        const [billData, orderData] = await Promise.all([
          loadBills(),
          loadOrders(),
        ]);

        setBills(billData);
        setOrders(orderData);
      } catch (err: any) {
        console.error('Failed to load billing data:', err);

        setError(
          err?.response?.data?.message ||
            err?.response?.data?.error ||
            'Unable to load billing data.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadBills, loadOrders],
  );

  useEffect(() => {
    load();

    const socket = getSocket();

    const events = [
      'order.created',
      'order.served',
      'order.completed',
      'order.cancelled',
      'bill.created',
      'payment.recorded',
    ];

    const refresh = () => {
      load(true);
    };

    events.forEach((event) => {
      socket?.on(event, refresh);
    });

    return () => {
      events.forEach((event) => {
        socket?.off(event, refresh);
      });
    };
  }, [load]);

  /*
   * Orders that are ready for billing.
   *
   * SERVED and COMPLETED orders are eligible according
   * to the current backend billing API.
   */
  const billableOrders = useMemo(() => {
    return orders.filter((order) => {
      if (
        order.status !== 'SERVED' &&
        order.status !== 'COMPLETED'
      ) {
        return false;
      }

      return !bills.some((bill) =>
        bill.items?.some(
          (billItem) => billItem.orderId === order.id,
        ),
      );
    });
  }, [orders, bills]);

  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bills.filter((bill) => {
      const matchesStatus =
        statusFilter === 'ALL' ||
        bill.paymentStatus === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      const orderNumbers =
        bill.items
          ?.map((item) => item.order?.orderNumber)
          .filter(Boolean)
          .join(' ') ?? '';

      const billNumber = String(bill.billNumber);

      return (
        billNumber.toLowerCase().includes(query) ||
        orderNumbers.toLowerCase().includes(query)
      );
    });
  }, [bills, search, statusFilter]);

  const stats = useMemo(() => {
    const paidBills = bills.filter(
      (bill) => bill.paymentStatus === 'PAID',
    );

    const unpaidBills = bills.filter(
      (bill) => bill.paymentStatus === 'UNPAID',
    );

    const partiallyPaidBills = bills.filter(
      (bill) => bill.paymentStatus === 'PARTIALLY_PAID',
    );

    const refundedBills = bills.filter(
      (bill) => bill.paymentStatus === 'REFUNDED',
    );

    const totalSales = paidBills.reduce(
      (sum, bill) => sum + numberValue(bill.total),
      0,
    );

    const unpaidAmount = [...unpaidBills, ...partiallyPaidBills].reduce(
      (sum, bill) => sum + remainingAmount(bill),
      0,
    );

    const refundedAmount = refundedBills.reduce(
      (sum, bill) => sum + numberValue(bill.total),
      0,
    );

    return {
      totalBills: bills.length,
      pendingBills: billableOrders.length,
      paidBills: paidBills.length,
      unpaidBills:
        unpaidBills.length + partiallyPaidBills.length,
      totalSales,
      unpaidAmount,
      refundedAmount,
    };
  }, [bills, billableOrders]);

  async function generateBill(order: OrderWithBilling) {
    if (generatingOrderId) {
      return;
    }

    try {
      setGeneratingOrderId(order.id);
      setError('');

      let payload: {
        orderId?: string;
        tableSessionId?: string;
      };

      if (order.type === 'TAKEAWAY') {
        payload = {
          orderId: order.id,
        };
      } else {
        const tableSessionId =
          order.tableSession?.table
            ? undefined
            : undefined;

        /*
         * For dine-in orders the backend expects tableSessionId.
         * The order list may not expose it directly, so refresh
         * the individual order before generating the bill.
         */
        const response = await api.get(`/orders/${order.id}`);

        const fullOrder =
          response.data?.order ?? response.data;

        if (!fullOrder?.tableSessionId) {
          throw new Error(
            'This dine-in order does not have an active table session.',
          );
        }

        payload = {
          tableSessionId: fullOrder.tableSessionId,
        };
      }

      await api.post('/bills/generate', payload);

      await load(true);
    } catch (err: any) {
      console.error('Failed to generate bill:', err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Unable to generate bill.',
      );
    } finally {
      setGeneratingOrderId(null);
    }
  }

  async function openBill(bill: Bill) {
    try {
      setError('');

      const response = await api.get(`/bills/${bill.id}`);

      const fullBill =
        response.data?.bill ?? response.data;

      setSelectedBill(fullBill);
    } catch (err: any) {
      console.error('Failed to load bill:', err);

      setError(
        err?.response?.data?.message ||
          'Unable to load bill details.',
      );
    }
  }

  function openPayment(bill: Bill) {
    const remaining = remainingAmount(bill);

    if (remaining <= 0) {
      return;
    }

    setPaymentBill(bill);
    setPaymentAmount(remaining.toFixed(2));
    setPaymentMethod('CASH');
  }

  async function recordPayment() {
    if (!paymentBill) {
      return;
    }

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }

    const remaining = remainingAmount(paymentBill);

    if (amount > remaining + 0.0001) {
      setError(
        `Payment cannot exceed the remaining amount of ${money(
          remaining,
        )}.`,
      );
      return;
    }

    try {
      setRecordingPayment(true);
      setError('');

      await api.post('/payments/record', {
        billId: paymentBill.id,
        amount,
        method: paymentMethod,
      });

      setPaymentBill(null);
      setPaymentAmount('');

      await load(true);
    } catch (err: any) {
      console.error('Failed to record payment:', err);

      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Unable to record payment.',
      );
    } finally {
      setRecordingPayment(false);
    }
  }

  async function printBill(bill: Bill) {
    try {
      setPrinting(true);

      const response = await api.get(`/bills/${bill.id}`);

      const fullBill =
        response.data?.bill ?? response.data;

      const popup = window.open(
        '',
        '_blank',
        'width=420,height=700',
      );

      if (!popup) {
        throw new Error(
          'Unable to open print window. Please allow popups for this site.',
        );
      }

      const items =
        fullBill.items
          ?.flatMap((billItem: any) => {
            const order = billItem.order;

            if (!order?.items) {
              return [];
            }

            return order.items.map((item: any) => ({
              name: item.nameSnapshot,
              quantity: item.quantity,
              price: numberValue(item.priceSnapshot),
              amount:
                numberValue(item.priceSnapshot) *
                Number(item.quantity),
            }));
          }) ?? [];

      const itemRows =
        items.length > 0
          ? items
              .map(
                (item: any) => `
                  <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td class="qty">${item.quantity}</td>
                    <td class="amount">${money(item.amount)}</td>
                  </tr>
                `,
              )
              .join('')
          : `
              <tr>
                <td colspan="3" class="empty">
                  Bill items are stored against this order.
                </td>
              </tr>
            `;

      const paymentRows =
        fullBill.payments?.length > 0
          ? fullBill.payments
              .map(
                (payment: Payment) => `
                  <tr>
                    <td>${payment.method}</td>
                    <td>${formatDate(payment.recordedAt)}</td>
                    <td class="amount">${money(
                      payment.amount,
                    )}</td>
                  </tr>
                `,
              )
              .join('')
          : `
              <tr>
                <td colspan="3" class="empty">
                  No payment recorded
                </td>
              </tr>
            `;

      const tableNumber =
        fullBill.tableSession?.table?.number;

      popup.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>Bill #${fullBill.billNumber}</title>

            <style>
              @page {
                size: 80mm auto;
                margin: 0;
              }

              * {
                box-sizing: border-box;
              }

              body {
                margin: 0;
                padding: 10px;
                width: 80mm;
                font-family: Arial, sans-serif;
                font-size: 12px;
                color: #000;
              }

              .center {
                text-align: center;
              }

              .restaurant {
                font-size: 18px;
                font-weight: bold;
              }

              .muted {
                font-size: 10px;
                color: #555;
              }

              .line {
                border-top: 1px dashed #000;
                margin: 8px 0;
              }

              table {
                width: 100%;
                border-collapse: collapse;
              }

              td {
                padding: 3px 0;
                vertical-align: top;
              }

              .qty {
                width: 35px;
                text-align: center;
              }

              .amount {
                text-align: right;
                white-space: nowrap;
              }

              .total {
                font-size: 15px;
                font-weight: bold;
              }

              .empty {
                text-align: center;
                color: #555;
                padding: 8px 0;
              }

              .footer {
                margin-top: 12px;
                text-align: center;
                font-size: 11px;
              }
            </style>
          </head>

          <body>
            <div class="center">
              <div class="restaurant">
                SAM'S RESTAURANT
              </div>

              <div class="muted">
                Restaurant Management System
              </div>
            </div>

            <div class="line"></div>

            <table>
              <tr>
                <td>Bill No.</td>
                <td class="amount">
                  #${fullBill.billNumber}
                </td>
              </tr>

              <tr>
                <td>Order No.</td>
                <td class="amount">
                  #${
                    fullBill.items?.[0]?.order?.orderNumber ??
                    '-'
                  }
                </td>
              </tr>

              ${
                tableNumber !== undefined
                  ? `
                    <tr>
                      <td>Table</td>
                      <td class="amount">
                        ${tableNumber}
                      </td>
                    </tr>
                  `
                  : ''
              }

              <tr>
                <td>Date</td>
                <td class="amount">
                  ${formatDate(fullBill.createdAt)}
                </td>
              </tr>
            </table>

            <div class="line"></div>

            <table>
              <thead>
                <tr>
                  <td><strong>Item</strong></td>
                  <td class="qty">
                    <strong>Qty</strong>
                  </td>
                  <td class="amount">
                    <strong>Amount</strong>
                  </td>
                </tr>
              </thead>

              <tbody>
                ${itemRows}
              </tbody>
            </table>

            <div class="line"></div>

            <table>
              <tr>
                <td>Subtotal</td>
                <td class="amount">
                  ${money(fullBill.subtotal)}
                </td>
              </tr>

              <tr>
                <td>Discount</td>
                <td class="amount">
                  ${money(fullBill.discount)}
                </td>
              </tr>

              <tr>
                <td>Tax</td>
                <td class="amount">
                  ${money(fullBill.tax)}
                </td>
              </tr>

              <tr>
                <td class="total">
                  TOTAL
                </td>
                <td class="amount total">
                  ${money(fullBill.total)}
                </td>
              </tr>
            </table>

            <div class="line"></div>

            <strong>Payments</strong>

            <table>
              <tbody>
                ${paymentRows}
              </tbody>
            </table>

            <div class="line"></div>

            <table>
              <tr>
                <td>Status</td>
                <td class="amount">
                  ${fullBill.paymentStatus}
                </td>
              </tr>

              <tr>
                <td>Remaining</td>
                <td class="amount">
                  ${money(remainingAmount(fullBill))}
                </td>
              </tr>
            </table>

            <div class="footer">
              Thank you for visiting SAM'S RESTAURANT.
              <br />
              Please visit again.
            </div>

            <script>
              window.onload = function () {
                window.print();
              };
            </script>
          </body>
        </html>
      `);

      popup.document.close();
    } catch (err: any) {
      console.error('Failed to print bill:', err);

      setError(
        err?.message ||
          'Unable to print the bill.',
      );
    } finally {
      setPrinting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="font-serif text-3xl font-bold">
          Billing
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Loading billing information...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold">
            Billing
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage completed orders, bills, payments and receipts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>

          <button
            type="button"
            onClick={() => load(true)}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b pb-3">
        {[
          ['OVERVIEW', 'Overview'],
          ['ORDERS', 'Orders'],
          ['BILLS', 'Bills'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              setActiveTab(
                value as 'OVERVIEW' | 'ORDERS' | 'BILLS',
              )
            }
            className={[
              'rounded-lg px-4 py-2 text-sm font-semibold',
              activeTab === value
                ? 'bg-turmeric text-coffee-dark'
                : 'bg-white border hover:bg-gray-50',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'OVERVIEW' && (
        <div className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Today's Billing Queue"
              value={stats.pendingBills}
              subtitle="Completed/served orders"
            />

            <StatCard
              title="Paid Bills"
              value={stats.paidBills}
              subtitle={money(stats.totalSales)}
            />

            <StatCard
              title="Pending Payment"
              value={stats.unpaidBills}
              subtitle={money(stats.unpaidAmount)}
            />

            <StatCard
              title="Refunded"
              value={money(stats.refundedAmount)}
              subtitle="Refunded bill value"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* Pending billing */}
            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl font-bold">
                    Orders Waiting for Billing
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    Served or completed orders without a bill.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('ORDERS')}
                  className="text-sm font-semibold underline"
                >
                  View all
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {billableOrders.slice(0, 5).map((order) => (
                  <OrderBillingCard
                    key={order.id}
                    order={order}
                    generating={
                      generatingOrderId === order.id
                    }
                    onGenerate={() => generateBill(order)}
                  />
                ))}

                {billableOrders.length === 0 && (
                  <EmptyState text="No orders are waiting for billing." />
                )}
              </div>
            </section>

            {/* Recent bills */}
            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl font-bold">
                    Recent Bills
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    Latest billing activity.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('BILLS')}
                  className="text-sm font-semibold underline"
                >
                  View all
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {bills.slice(0, 5).map((bill) => (
                  <BillRow
                    key={bill.id}
                    bill={bill}
                    onView={() => openBill(bill)}
                    onPayment={() => openPayment(bill)}
                    onPrint={() => printBill(bill)}
                  />
                ))}

                {bills.length === 0 && (
                  <EmptyState text="No bills have been generated yet." />
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Orders */}
      {activeTab === 'ORDERS' && (
        <div className="mt-6">
          <div className="mb-4 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search order number..."
                className="flex-1 rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-turmeric"
              />

              <button
                type="button"
                onClick={() => setSearch('')}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="rounded-xl border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Billing</th>
                    <th className="px-4 py-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {orders
                    .filter((order) => {
                      if (!search.trim()) {
                        return true;
                      }

                      return String(order.orderNumber)
                        .includes(search.trim());
                    })
                    .map((order) => {
                      const existingBill = bills.find((bill) =>
                        bill.items?.some(
                          (item) =>
                            item.orderId === order.id,
                        ),
                      );

                      const canBill =
                        (order.status === 'SERVED' ||
                          order.status === 'COMPLETED') &&
                        !existingBill;

                      return (
                        <tr
                          key={order.id}
                          className="border-b last:border-b-0"
                        >
                          <td className="px-4 py-4 font-semibold">
                            #{order.orderNumber}
                          </td>

                          <td className="px-4 py-4">
                            {order.type}
                          </td>

                          <td className="px-4 py-4">
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium">
                              {order.status}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            {money(order.total)}
                          </td>

                          <td className="px-4 py-4">
                            {existingBill ? (
                              <span
                                className={[
                                  'rounded-full px-2 py-1 text-xs font-semibold',
                                  statusClass(
                                    existingBill.paymentStatus,
                                  ),
                                ].join(' ')}
                              >
                                {statusLabel(
                                  existingBill.paymentStatus,
                                )}
                              </span>
                            ) : canBill ? (
                              <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">
                                BILL PENDING
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">
                                Not ready
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-4 text-right">
                            {canBill && (
                              <button
                                type="button"
                                onClick={() =>
                                  generateBill(order)
                                }
                                disabled={
                                  generatingOrderId !== null
                                }
                                className="rounded-lg bg-turmeric px-3 py-2 text-xs font-bold text-coffee-dark hover:opacity-90 disabled:opacity-50"
                              >
                                {generatingOrderId ===
                                order.id
                                  ? 'Generating...'
                                  : 'Generate Bill'}
                              </button>
                            )}

                            {existingBill && (
                              <button
                                type="button"
                                onClick={() =>
                                  openBill(existingBill)
                                }
                                className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-gray-50"
                              >
                                View Bill
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {orders.length === 0 && (
              <EmptyState text="No orders found." />
            )}
          </div>
        </div>
      )}

      {/* Bills */}
      {activeTab === 'BILLS' && (
        <div className="mt-6">
          <div className="mb-4 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row">
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search bill number or order number..."
                className="flex-1 rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-turmeric"
              />

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="rounded-lg border px-4 py-2 text-sm"
              >
                <option value="ALL">All Bills</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIALLY_PAID">
                  Partially Paid
                </option>
                <option value="PAID">Paid</option>
                <option value="REFUNDED">Refunded</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                }}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredBills.map((bill) => (
              <BillRow
                key={bill.id}
                bill={bill}
                onView={() => openBill(bill)}
                onPayment={() => openPayment(bill)}
                onPrint={() => printBill(bill)}
              />
            ))}

            {filteredBills.length === 0 && (
              <EmptyState text="No bills match your filters." />
            )}
          </div>
        </div>
      )}

      {/* View Bill Modal */}
      {selectedBill && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="font-serif text-2xl font-bold">
                  Bill #{selectedBill.billNumber}
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  {formatDate(selectedBill.createdAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBill(null)}
                className="rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-gray-50 p-4">
                <div>
                  <p className="text-xs text-gray-500">
                    Order
                  </p>

                  <p className="font-semibold">
                    #
                    {selectedBill.items?.[0]?.order
                      ?.orderNumber ?? '-'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Status
                  </p>

                  <span
                    className={[
                      'inline-block rounded-full px-2 py-1 text-xs font-semibold',
                      statusClass(
                        selectedBill.paymentStatus,
                      ),
                    ].join(' ')}
                  >
                    {statusLabel(
                      selectedBill.paymentStatus,
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-5">
                <h3 className="font-semibold">
                  Items
                </h3>

                <div className="mt-3 space-y-2">
                  {selectedBill.items?.flatMap(
                    (billItem) =>
                      billItem.order?.items?.map(
                        (item) => (
                          <div
                            key={item.id}
                            className="flex justify-between gap-4 border-b pb-2 text-sm"
                          >
                            <span>
                              {item.quantity} ×{' '}
                              {item.nameSnapshot}
                            </span>

                            <span className="font-medium">
                              {money(
                                numberValue(
                                  item.priceSnapshot,
                                ) * item.quantity,
                              )}
                            </span>
                          </div>
                        ),
                      ) ?? [],
                  )}

                  {(!selectedBill.items ||
                    selectedBill.items.length === 0) && (
                    <p className="text-sm text-gray-400">
                      No item details available.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-2 border-t pt-4">
                <SummaryRow
                  label="Subtotal"
                  value={money(
                    selectedBill.subtotal,
                  )}
                />

                <SummaryRow
                  label="Discount"
                  value={money(
                    selectedBill.discount,
                  )}
                />

                <SummaryRow
                  label="Tax"
                  value={money(selectedBill.tax)}
                />

                <SummaryRow
                  label="Total"
                  value={money(selectedBill.total)}
                  strong
                />

                <SummaryRow
                  label="Paid"
                  value={money(
                    paymentTotal(selectedBill),
                  )}
                />

                <SummaryRow
                  label="Remaining"
                  value={money(
                    remainingAmount(selectedBill),
                  )}
                  strong
                />
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-2">
                {selectedBill.paymentStatus !==
                  'PAID' &&
                  selectedBill.paymentStatus !==
                    'REFUNDED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBill(null);
                        openPayment(selectedBill);
                      }}
                      className="rounded-lg bg-leaf px-4 py-2 text-sm font-semibold text-white"
                    >
                      Record Payment
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() =>
                    printBill(selectedBill)
                  }
                  disabled={printing}
                  className="rounded-lg bg-turmeric px-4 py-2 text-sm font-bold text-coffee-dark disabled:opacity-50"
                >
                  {printing
                    ? 'Preparing...'
                    : 'Print Bill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentBill && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="font-serif text-xl font-bold">
                  Record Payment
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  Bill #{paymentBill.billNumber}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPaymentBill(null)}
                className="rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              <div className="rounded-xl bg-gray-50 p-4">
                <SummaryRow
                  label="Bill Total"
                  value={money(paymentBill.total)}
                />

                <SummaryRow
                  label="Already Paid"
                  value={money(
                    paymentTotal(paymentBill),
                  )}
                />

                <SummaryRow
                  label="Remaining"
                  value={money(
                    remainingAmount(paymentBill),
                  )}
                  strong
                />
              </div>

              <label className="mt-5 block text-sm font-semibold">
                Payment Amount
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(event) =>
                  setPaymentAmount(event.target.value)
                }
                className="mt-2 w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-turmeric"
              />

              <label className="mt-4 block text-sm font-semibold">
                Payment Method
              </label>

              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(
                    event.target.value as PaymentMethod,
                  )
                }
                className="mt-2 w-full rounded-lg border px-4 py-3"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentBill(null)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={recordPayment}
                  disabled={recordingPayment}
                  className="rounded-lg bg-leaf px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {recordingPayment
                    ? 'Recording...'
                    : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </p>

      <div className="mt-3 font-serif text-3xl font-bold">
        {value}
      </div>

      <p className="mt-1 text-xs text-gray-500">
        {subtitle}
      </p>
    </div>
  );
}

function OrderBillingCard({
  order,
  generating,
  onGenerate,
}: {
  order: OrderWithBilling;
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-semibold">
          Order #{order.orderNumber}
        </div>

        <div className="mt-1 text-xs text-gray-500">
          {order.type} · {order.status}
        </div>
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className="rounded-lg bg-turmeric px-4 py-2 text-sm font-bold text-coffee-dark disabled:opacity-50"
      >
        {generating
          ? 'Generating...'
          : 'Generate Bill'}
      </button>
    </div>
  );
}

function BillRow({
  bill,
  onView,
  onPayment,
  onPrint,
}: {
  bill: Bill;
  onView: () => void;
  onPayment: () => void;
  onPrint: () => void;
}) {
  const orderNumber =
    bill.items?.[0]?.order?.orderNumber;

  const remaining = remainingAmount(bill);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-lg font-bold">
              Bill #{bill.billNumber}
            </span>

            <span
              className={[
                'rounded-full px-2 py-1 text-xs font-semibold',
                statusClass(bill.paymentStatus),
              ].join(' ')}
            >
              {statusLabel(bill.paymentStatus)}
            </span>
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Order #{orderNumber ?? '-'} ·{' '}
            {formatDate(bill.createdAt)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-gray-400">
              Total
            </p>

            <p className="font-semibold">
              {money(bill.total)}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-400">
              Paid
            </p>

            <p className="font-semibold">
              {money(paymentTotal(bill))}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-400">
              Due
            </p>

            <p className="font-semibold">
              {money(remaining)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onView}
            className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-gray-50"
          >
            View
          </button>

          {bill.paymentStatus !== 'PAID' &&
            bill.paymentStatus !== 'REFUNDED' && (
              <button
                type="button"
                onClick={onPayment}
                className="rounded-lg bg-leaf px-3 py-2 text-xs font-semibold text-white"
              >
                Payment
              </button>
            )}

          <button
            type="button"
            onClick={onPrint}
            className="rounded-lg bg-turmeric px-3 py-2 text-xs font-bold text-coffee-dark"
          >
            Print Bill
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-4',
        strong ? 'font-bold' : 'text-sm',
      ].join(' ')}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-gray-50 px-5 py-10 text-center">
      <p className="text-sm text-gray-400">
        {text}
      </p>
    </div>
  );
}