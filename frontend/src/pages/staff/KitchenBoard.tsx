import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { getSocket } from '../../api/socket';
import type { OrderDTO } from '../../types';

type ColumnConfig = {
  key: string;
  label: string;
  description: string;
  next?: string;
  nextLabel?: string;
};

const COLUMNS: ColumnConfig[] = [
  {
    key: 'PENDING',
    label: 'New',
    description: 'New orders waiting for acceptance',
    next: 'ACCEPTED',
    nextLabel: 'Accept Order',
  },
  {
    key: 'ACCEPTED',
    label: 'Accepted',
    description: 'Orders accepted by the kitchen',
    next: 'PREPARING',
    nextLabel: 'Start Preparing',
  },
  {
    key: 'PREPARING',
    label: 'Preparing',
    description: 'Orders currently being prepared',
    next: 'READY',
    nextLabel: 'Mark Ready',
  },
  {
    key: 'READY',
    label: 'Ready',
    description: 'Ready for the service team',
  },
];

export default function KitchenBoard() {
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

      const res = await api.get('/orders/kitchen');

      setOrders(res.data?.orders ?? []);
    } catch (err: any) {
      console.error('Failed to load kitchen orders:', err);

      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Unable to load kitchen orders. Please try again.';

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

    events.forEach((event) => {
      socket?.on(event, () => {
        load();
      });
    });

    return () => {
      events.forEach((event) => {
        socket?.off(event);
      });
    };
  }, [load]);

  async function advance(orderId: string, nextStatus: string) {
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
      console.error('Failed to update order status:', err);

      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Unable to update the order status. Please try again.';

      setError(message);
    } finally {
      setProcessingOrderId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="mb-6">
          <h1 className="font-serif text-2xl font-bold">
            Kitchen Display System
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Loading kitchen orders...
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((column) => (
            <div
              key={column.key}
              className="bg-gray-50 rounded-xl border p-4 min-h-[220px]"
            >
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-4" />
              <div className="h-24 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold">
            Kitchen Display System
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Manage orders from acceptance through preparation and readiness.
          </p>
        </div>

        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>

            <button
              type="button"
              onClick={() => load(true)}
              className="font-semibold underline whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((column) => {
          const columnOrders = orders.filter(
            (order) => order.status === column.key,
          );

          return (
            <div
              key={column.key}
              className="bg-gray-50 border rounded-xl p-4 min-h-[300px]"
            >
              {/* Column Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold text-lg">{column.label}</h2>

                  <p className="text-xs text-gray-500 mt-1">
                    {column.description}
                  </p>
                </div>

                <span className="min-w-7 h-7 px-2 rounded-full bg-white border flex items-center justify-center text-sm font-semibold">
                  {columnOrders.length}
                </span>
              </div>

              {/* Orders */}
              <div className="space-y-3">
                {columnOrders.map((order) => {
                  const isProcessing = processingOrderId === order.id;

                  return (
                    <div
                      key={order.id}
                      className="bg-white border rounded-xl p-4 shadow-sm"
                    >
                      {/* Order number */}
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <div className="font-serif font-bold text-lg">
                            #{order.orderNumber}
                          </div>

                          <div className="text-xs text-gray-500">
                            Kitchen Order
                          </div>
                        </div>

                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100">
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
                              <span className="font-semibold min-w-[24px]">
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
                      {column.next && (
                        <button
                          type="button"
                          onClick={() =>
                            advance(order.id, column.next as string)
                          }
                          disabled={processingOrderId !== null}
                          className="w-full mt-4 bg-leaf text-white text-sm font-medium rounded-lg py-2.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing
                            ? 'Updating...'
                            : column.nextLabel}
                        </button>
                      )}

                      {/* Ready state */}
                      {column.key === 'READY' && (
                        <div className="mt-4 rounded-lg bg-gray-50 border px-3 py-2.5">
                          <p className="text-sm font-medium">
                            Ready for service
                          </p>

                          <p className="text-xs text-gray-500 mt-1">
                            Waiter/service staff will serve and complete this
                            order.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty column */}
                {columnOrders.length === 0 && (
                  <div className="rounded-lg border border-dashed bg-white px-4 py-8 text-center">
                    <p className="text-sm text-gray-400">
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