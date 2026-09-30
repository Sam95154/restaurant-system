import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { getSocket } from '../../api/socket';
import type { OrderDTO } from '../../types';

type OrderAction = {
  nextStatus: string;
  label: string;
};

const ACTIONS: Record<string, OrderAction | undefined> = {
  READY: {
    nextStatus: 'SERVED',
    label: 'Mark Served',
  },
  SERVED: {
    nextStatus: 'COMPLETED',
    label: 'Complete Order',
  },
};

const DISPLAY_STATUSES = ['READY', 'SERVED', 'COMPLETED'];

export default function Orders() {
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(
    null,
  );

  const load = useCallback(async (showRefreshState = false) => {
    try {
      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const res = await api.get('/orders');

      setOrders(res.data?.orders ?? []);
    } catch (err: any) {
      console.error('Failed to load orders:', err);

      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Unable to load orders. Please try again.';

      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();

    const socket = getSocket();

    const events = [
      'order.created',
      'order.accepted',
      'order.preparing',
      'order.ready',
      'order.served',
      'order.completed',
      'order.cancelled',
    ];

    const refreshOrders = () => {
      load();
    };

    events.forEach((event) => {
      socket?.on(event, refreshOrders);
    });

    return () => {
      events.forEach((event) => {
        socket?.off(event, refreshOrders);
      });
    };
  }, [load]);

  async function advanceOrder(orderId: string, nextStatus: string) {
    if (processingOrderId) {
      return;
    }

    try {
      setProcessingOrderId(orderId);
      setError('');

      await api.patch(`/orders/${orderId}/status`, {
        status: nextStatus,
      });

      await load();
    } catch (err: any) {
      console.error('Failed to update order:', err);

      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Unable to update the order. Please try again.';

      setError(message);
    } finally {
      setProcessingOrderId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="font-serif text-2xl font-bold">
          Orders
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Loading orders...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold">
            Orders
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Serve ready orders and complete them after service.
          </p>
        </div>

        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>

          <button
            type="button"
            onClick={() => load(true)}
            className="whitespace-nowrap font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Status columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DISPLAY_STATUSES.map((status) => {
          const statusOrders = orders.filter(
            (order) => order.status === status,
          );

          const title =
            status === 'READY'
              ? 'Ready to Serve'
              : status === 'SERVED'
                ? 'Served'
                : 'Completed';

          const description =
            status === 'READY'
              ? 'Kitchen has completed the order'
              : status === 'SERVED'
                ? 'Order has been served'
                : 'Service cycle completed';

          return (
            <div
              key={status}
              className="min-h-[320px] rounded-xl border bg-gray-50 p-4"
            >
              {/* Column heading */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {title}
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    {description}
                  </p>
                </div>

                <span className="flex h-7 min-w-7 items-center justify-center rounded-full border bg-white px-2 text-sm font-semibold">
                  {statusOrders.length}
                </span>
              </div>

              {/* Orders */}
              <div className="space-y-3">
                {statusOrders.map((order) => {
                  const action = ACTIONS[status];
                  const isProcessing =
                    processingOrderId === order.id;

                  return (
                    <div
                      key={order.id}
                      className="rounded-xl border bg-white p-4 shadow-sm"
                    >
                      {/* Order header */}
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-serif text-lg font-bold">
                            #{order.orderNumber}
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            Order
                          </div>
                        </div>

                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium">
                          {order.status}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="border-t pt-3">
                        <ul className="space-y-2 text-sm">
                          {order.items.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-start gap-2"
                            >
                              <span className="min-w-[28px] font-semibold">
                                {item.quantity}×
                              </span>

                              <span className="text-gray-700">
                                {item.nameSnapshot}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Action */}
                      {action && (
                        <button
                          type="button"
                          onClick={() =>
                            advanceOrder(
                              order.id,
                              action.nextStatus,
                            )
                          }
                          disabled={
                            processingOrderId !== null
                          }
                          className="mt-4 w-full rounded-lg bg-leaf py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isProcessing
                            ? 'Updating...'
                            : action.label}
                        </button>
                      )}

                      {/* Completed message */}
                      {status === 'COMPLETED' && (
                        <div className="mt-4 rounded-lg border bg-gray-50 px-3 py-2.5">
                          <p className="text-sm font-medium">
                            Order completed
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            This order is ready for billing.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty state */}
                {statusOrders.length === 0 && (
                  <div className="rounded-lg border border-dashed bg-white px-4 py-8 text-center">
                    <p className="text-sm italic text-gray-400">
                      No orders here
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}