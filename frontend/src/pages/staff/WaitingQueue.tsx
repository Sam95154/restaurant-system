import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
type Branch = {
  id: string;
  name: string;
  status?: string;
};

type QueueStatus =
  | 'WAITING'
  | 'CALLED'
  | 'SEATED'
  | 'CANCELLED'
  | 'NO_SHOW';

type QueueEntry = {
  id: string;
  tokenNumber: number;
  queueToken: string;
  customerName: string;
  phone: string;
  partySize: number;
  status: QueueStatus;
  branchId: string;
  assignedTableId?: string | null;
  createdAt: string;
  calledAt?: string | null;
  seatedAt?: string | null;
  cancelledAt?: string | null;
  assignedTable?: {
    id: string;
    number: number;
    capacity: number;
  } | null;
};

type RestaurantTable = {
  id: string;
  number: number;
  capacity: number;
  status: string;
};

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
).replace(/\/api\/?$/, '');

const getPayload = (response: any) => response?.data?.data ?? response?.data;

const getQueueUrl = (branchId: string) => {
  return `${window.location.origin}/queue?branchId=${encodeURIComponent(
    branchId,
  )}`;
};

const getQRCodeUrl = (branchId: string) => {
  const queueUrl = getQueueUrl(branchId);

  return `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(
    queueUrl,
  )}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';

  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const statusClasses: Record<QueueStatus, string> = {
  WAITING: 'bg-yellow-100 text-yellow-800',
  CALLED: 'bg-blue-100 text-blue-800',
  SEATED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
  NO_SHOW: 'bg-red-100 text-red-800',
};

const WaitingQueue: React.FC = () => {
      const { employee } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);

  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedQueue, setSelectedQueue] =
    useState<QueueEntry | null>(null);

  const [selectedTableId, setSelectedTableId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId),
    [branches, selectedBranchId],
  );

  const queueUrl = useMemo(
    () => (selectedBranchId ? getQueueUrl(selectedBranchId) : ''),
    [selectedBranchId],
  );

  const qrCodeUrl = useMemo(
    () => (selectedBranchId ? getQRCodeUrl(selectedBranchId) : ''),
    [selectedBranchId],
  );

 const loadBranches = useCallback(async () => {
  try {
    setError('');

    const isRestrictedStaff =
      employee?.role === 'MANAGER' ||
      employee?.role === 'SERVICE_EMPLOYEE';

    const response = await api.get(
      isRestrictedStaff
        ? '/branches/public'
        : '/branches',
    );

    const data = getPayload(response);

    const branchList: Branch[] = Array.isArray(data)
      ? data
      : data?.branches || data?.data || [];

    const visibleBranches =
      isRestrictedStaff && employee?.branchId
        ? branchList.filter(
            (branch) => branch.id === employee.branchId,
          )
        : branchList;

    setBranches(visibleBranches);

    const savedBranchId =
      localStorage.getItem('selected_branch_id');

    const selectedBranch =
      visibleBranches.find(
        (branch) => branch.id === savedBranchId,
      ) ||
      visibleBranches.find(
        (branch) => branch.id === employee?.branchId,
      ) ||
      visibleBranches[0];

    if (selectedBranch) {
      setSelectedBranchId(selectedBranch.id);
    }
  } catch (err: any) {
    console.error(err);

    setError(
      err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Unable to load restaurant branches.',
    );
  } finally {
    setLoading(false);
  }
}, [employee?.branchId, employee?.role]);

  const loadQueue = useCallback(async () => {
    if (!selectedBranchId) return;

    setQueueLoading(true);

    try {
      const response = await api.get('/waiting-queue', {
        params: {
          branchId: selectedBranchId,
        },
      });

      const data = getPayload(response);

      const queueList = Array.isArray(data)
  ? data
  : data?.queue ||
    data?.queues ||
    data?.waitingQueue ||
    data?.data ||
    [];

      setQueue(queueList);
      setError('');
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          'Unable to load waiting queue.',
      );
    } finally {
      setQueueLoading(false);
    }
  }, [selectedBranchId]);

  const loadTables = useCallback(async () => {
    if (!selectedBranchId) return;

    try {
      const response = await api.get('/tables', {
        params: {
          branchId: selectedBranchId,
        },
      });

      const data = getPayload(response);

      const tableList = Array.isArray(data)
        ? data
        : data?.tables ||
          data?.data ||
          [];

      setTables(tableList);
    } catch {
      setTables([]);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    if (!selectedBranchId) return;

    loadQueue();
    loadTables();

    const timer = window.setInterval(() => {
      loadQueue();
      loadTables();
    }, 10000);

    return () => window.clearInterval(timer);
  }, [selectedBranchId, loadQueue, loadTables]);

  const performAction = async (
    queueId: string,
    action: 'call' | 'assign-table' | 'seat',
  ) => {
    setActionLoading(true);

    try {
      if (action === 'assign-table') {
        if (!selectedTableId) {
          setError('Please select a table first.');
          return;
        }

        await api.post(
          `/waiting-queue/${queueId}/assign-table`,
          {
            tableId: selectedTableId,
          },
        );
      } else {
        await api.post(`/waiting-queue/${queueId}/${action}`);
      }

      setSelectedQueue(null);
      setSelectedTableId('');
      setError('');

      await loadQueue();
      await loadTables();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          `Unable to ${action.replace('-', ' ')} customer.`,
      );
    } finally {
      setActionLoading(false);
    }
  };

  const updateStatus = async (
    queueId: string,
    status: 'CANCELLED' | 'NO_SHOW',
  ) => {
    setActionLoading(true);

    try {
      await api.patch(`/waiting-queue/${queueId}/status`, {
        status,
      });

      setSelectedQueue(null);
      setError('');

      await loadQueue();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          'Unable to update queue status.',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const copyQueueUrl = async () => {
    if (!queueUrl) return;

    try {
      await navigator.clipboard.writeText(queueUrl);
      setError('');
      alert('Queue link copied.');
    } catch {
      setError('Unable to copy queue link.');
    }
  };

  const printQRCode = () => {
    if (!qrCodeUrl || !selectedBranch) return;

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      setError('Please allow pop-ups to print the QR code.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${selectedBranch.name} - Waiting Queue QR</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 40px;
            }

            h1 {
              margin-bottom: 8px;
            }

            p {
              color: #555;
            }

            img {
              width: 420px;
              max-width: 90%;
              margin-top: 20px;
            }
          </style>
        </head>

        <body>
          <h1>${selectedBranch.name}</h1>
          <h2>Waiting Queue</h2>
          <p>Scan this QR code to join the waiting queue.</p>
          <img src="${qrCodeUrl}" alt="Waiting Queue QR Code" />
          <p>Queue Token System</p>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    window.setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const activeQueue = queue.filter(
    (entry) =>
      entry.status === 'WAITING' ||
      entry.status === 'CALLED',
  );

  const completedQueue = queue.filter(
    (entry) =>
      entry.status === 'SEATED' ||
      entry.status === 'CANCELLED' ||
      entry.status === 'NO_SHOW',
  );

  const availableTables = tables.filter(
    (table) => table.status === 'AVAILABLE',
  );

  if (loading) {
    return (
      <div className="p-6 text-coffee-dark">
        Loading waiting queue...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-cream p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-coffee-dark">
              Waiting Queue
            </h1>

            <p className="mt-1 text-sm text-gray-600">
              Manage customers waiting for tables and generate the
              permanent entrance QR code.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              loadQueue();
              loadTables();
            }}
            disabled={queueLoading}
            className="rounded-lg bg-coffee-dark px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {queueLoading ? 'Refreshing...' : 'Refresh Queue'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Branch */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            Restaurant Branch
          </label>

          <select
            value={selectedBranchId}
            onChange={(event) =>
              setSelectedBranchId(event.target.value)
            }
            className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-coffee-dark"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        {/* QR Card */}
        {selectedBranchId && (
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">

            <div className="rounded-xl bg-white p-6 text-center shadow-sm">
              <h2 className="text-xl font-bold text-coffee-dark">
                Entrance Queue QR
              </h2>

              <p className="mt-2 text-sm text-gray-600">
                Customers can scan this QR code while waiting
                outside the restaurant.
              </p>

              <div className="mx-auto mt-5 flex justify-center">
                <img
                  src={qrCodeUrl}
                  alt="Waiting Queue QR Code"
                  className="h-64 w-64 rounded-lg border border-gray-200 p-2"
                />
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={printQRCode}
                  className="rounded-lg bg-coffee-dark px-4 py-3 font-semibold text-white hover:opacity-90"
                >
                  🖨️ Print QR Code
                </button>

                <button
                  type="button"
                  onClick={copyQueueUrl}
                  className="rounded-lg border border-gray-300 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  🔗 Copy Queue Link
                </button>
              </div>

              <div className="mt-4 break-all rounded-lg bg-gray-50 p-3 text-left text-xs text-gray-600">
                {queueUrl}
              </div>
            </div>

            {/* Queue Summary */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">

              <div className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Waiting
                </p>

                <p className="mt-2 text-3xl font-bold text-yellow-700">
                  {queue.filter(
                    (item) => item.status === 'WAITING',
                  ).length}
                </p>
              </div>

              <div className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Called
                </p>

                <p className="mt-2 text-3xl font-bold text-blue-700">
                  {queue.filter(
                    (item) => item.status === 'CALLED',
                  ).length}
                </p>
              </div>

              <div className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Available Tables
                </p>

                <p className="mt-2 text-3xl font-bold text-green-700">
                  {availableTables.length}
                </p>
              </div>

              <div className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Total Today
                </p>

                <p className="mt-2 text-3xl font-bold text-coffee-dark">
                  {queue.length}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Active Queue */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-bold text-coffee-dark">
              Active Waiting Queue
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Customers currently waiting for a table.
            </p>
          </div>

          {activeQueue.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No customers are currently waiting.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      Token
                    </th>
                    <th className="px-4 py-3 text-left">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left">
                      People
                    </th>
                    <th className="px-4 py-3 text-left">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-left">
                      Table
                    </th>
                    <th className="px-4 py-3 text-left">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {activeQueue.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-t border-gray-100"
                    >
                      <td className="px-4 py-4">
                        <span className="rounded-lg bg-coffee-dark px-3 py-2 font-bold text-white">
                          #{entry.tokenNumber}
                        </span>
                      </td>

                      <td className="px-4 py-4 font-semibold">
                        {entry.customerName}
                      </td>

                      <td className="px-4 py-4">
                        {entry.phone}
                      </td>

                      <td className="px-4 py-4">
                        {entry.partySize}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[entry.status]}`}
                        >
                          {entry.status}
                        </span>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </td>

                      <td className="px-4 py-4">
                        {entry.assignedTable ? (
                          <span className="font-semibold">
                            Table {entry.assignedTable.number}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">

                          {entry.status === 'WAITING' && (
                            <button
                              type="button"
                              onClick={() =>
                                performAction(
                                  entry.id,
                                  'call',
                                )
                              }
                              disabled={actionLoading}
                              className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                            >
                              📞 Call
                            </button>
                          )}

                          {(entry.status === 'WAITING' ||
                            entry.status === 'CALLED') && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedQueue(entry);
                                setSelectedTableId(
                                  entry.assignedTableId || '',
                                );
                              }}
                              disabled={actionLoading}
                              className="rounded-md bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                            >
                              🪑 Table
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              updateStatus(
                                entry.id,
                                'CANCELLED',
                              )
                            }
                            disabled={actionLoading}
                            className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </button>

                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Completed */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-bold text-coffee-dark">
              Queue History
            </h2>
          </div>

          {completedQueue.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No completed queue entries.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      Token
                    </th>
                    <th className="px-4 py-3 text-left">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left">
                      People
                    </th>
                    <th className="px-4 py-3 text-left">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left">
                      Table
                    </th>
                    <th className="px-4 py-3 text-left">
                      Joined
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {completedQueue.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-t border-gray-100"
                    >
                      <td className="px-4 py-4 font-bold">
                        #{entry.tokenNumber}
                      </td>

                      <td className="px-4 py-4">
                        {entry.customerName}
                      </td>

                      <td className="px-4 py-4">
                        {entry.partySize}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[entry.status]}`}
                        >
                          {entry.status}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        {entry.assignedTable
                          ? `Table ${entry.assignedTable.number}`
                          : '-'}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Table Assignment Modal */}
      {selectedQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">

            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-coffee-dark">
                  Assign Table
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Token #{selectedQueue.tokenNumber} ·{' '}
                  {selectedQueue.customerName} ·{' '}
                  {selectedQueue.partySize} people
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedQueue(null)}
                className="text-2xl text-gray-400 hover:text-gray-700"
              >
                ×
              </button>
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Available Table
              </label>

              <select
                value={selectedTableId}
                onChange={(event) =>
                  setSelectedTableId(event.target.value)
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3"
              >
                <option value="">
                  Select a table
                </option>

                {availableTables
                  .filter(
                    (table) =>
                      table.capacity >=
                      selectedQueue.partySize,
                  )
                  .map((table) => (
                    <option
                      key={table.id}
                      value={table.id}
                    >
                      Table {table.number} — Capacity{' '}
                      {table.capacity}
                    </option>
                  ))}
              </select>

              {availableTables.filter(
                (table) =>
                  table.capacity >= selectedQueue.partySize,
              ).length === 0 && (
                <p className="mt-2 text-sm text-red-600">
                  No available table can accommodate this
                  party size.
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">

              <button
                type="button"
                onClick={() => setSelectedQueue(null)}
                className="rounded-lg border border-gray-300 px-5 py-3 font-semibold text-gray-700"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() =>
                  performAction(
                    selectedQueue.id,
                    'assign-table',
                  )
                }
                disabled={
                  actionLoading || !selectedTableId
                }
                className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {actionLoading
                  ? 'Assigning...'
                  : 'Assign Table'}
              </button>

              {selectedQueue.assignedTableId && (
                <button
                  type="button"
                  onClick={() =>
                    performAction(
                      selectedQueue.id,
                      'seat',
                    )
                  }
                  disabled={actionLoading}
                  className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {actionLoading
                    ? 'Seating...'
                    : 'Seat Customer'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitingQueue;