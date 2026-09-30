import React, { useEffect, useMemo, useState } from 'react';
// qrcode does not currently ship TypeScript declarations in this project.
// @ts-expect-error -- use the package's JavaScript API until declarations are added.
import QRCode from 'qrcode';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type TableStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'RESERVED'
  | 'CLEANING'
  | 'OUT_OF_SERVICE';

interface Branch {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  status?: string;
}

interface TableSession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string | null;
  orders?: SessionOrder[];
  bills?: SessionBill[];
}

interface SessionOrder {
  id: string;
  orderNumber: number;
  type: string;
  status: string;
  total: string | number;
  createdAt: string;
}

interface SessionBill {
  id: string;
  billNumber: number;
  total: string | number;
  paymentStatus: string;
  createdAt: string;
}

interface RestaurantTable {
  id: string;
  number: number;
  capacity: number;
  status: TableStatus;
  branchId: string;
  sessions?: TableSession[];
}

interface TableForm {
  number: string;
  capacity: string;
  branchId: string;
}

const STATUS_OPTIONS: TableStatus[] = [
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'CLEANING',
  'OUT_OF_SERVICE',
];

function statusLabel(status: TableStatus) {
  switch (status) {
    case 'AVAILABLE':
      return 'Available';
    case 'OCCUPIED':
      return 'Occupied';
    case 'RESERVED':
      return 'Reserved';
    case 'CLEANING':
      return 'Cleaning';
    case 'OUT_OF_SERVICE':
      return 'Out of Service';
    default:
      return status;
  }
}

function statusClass(status: TableStatus) {
  switch (status) {
    case 'AVAILABLE':
      return 'bg-green-100 text-green-700';
    case 'OCCUPIED':
      return 'bg-blue-100 text-blue-700';
    case 'RESERVED':
      return 'bg-purple-100 text-purple-700';
    case 'CLEANING':
      return 'bg-yellow-100 text-yellow-700';
    case 'OUT_OF_SERVICE':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function formatDate(value?: string | null) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function money(value: string | number) {
  return `₹${Number(value).toFixed(2)}`;
}

export default function Tables() {
  const { employee } = useAuth();

  const isSuperAdmin = employee?.role === 'SUPER_ADMIN';

  const [branches, setBranches] = useState<Branch[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);

  const [selectedBranchId, setSelectedBranchId] = useState(
    employee?.branchId || ''
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TableStatus>(
    'ALL'
  );

  const [loading, setLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingTable, setEditingTable] =
    useState<RestaurantTable | null>(null);

  const [form, setForm] = useState<TableForm>({
    number: '',
    capacity: '',
    branchId: employee?.branchId || '',
  });

  const [saving, setSaving] = useState(false);

  const [statusTable, setStatusTable] =
    useState<RestaurantTable | null>(null);

  const [statusValue, setStatusValue] =
    useState<TableStatus>('AVAILABLE');

  const [statusSaving, setStatusSaving] = useState(false);

  const [dashboardTable, setDashboardTable] =
    useState<RestaurantTable | null>(null);

  const [qrTable, setQrTable] =
    useState<RestaurantTable | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | LOAD BRANCHES
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!isSuperAdmin) {
      if (employee?.branchId) {
        setSelectedBranchId(employee.branchId);

        setForm((current) => ({
          ...current,
          branchId: employee.branchId || '',
        }));
      }

      return;
    }

    async function loadBranches() {
      setBranchesLoading(true);
      setError('');

      try {
        const response = await api.get('/branches');

        setBranches(response.data?.branches || []);

        if (!selectedBranchId && response.data?.branches?.length) {
          const firstBranch = response.data.branches[0];

          setSelectedBranchId(firstBranch.id);

          setForm((current) => ({
            ...current,
            branchId: firstBranch.id,
          }));
        }
      } catch (err: any) {
        setError(
          err?.message ||
            'Unable to load branches.'
        );
      } finally {
        setBranchesLoading(false);
      }
    }

    loadBranches();
  }, [employee?.branchId, isSuperAdmin, selectedBranchId]);

  /*
  |--------------------------------------------------------------------------
  | LOAD TABLES
  |--------------------------------------------------------------------------
  */

  async function loadTables() {
    if (!selectedBranchId) {
      setTables([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.get('/tables', {
        params: {
          branchId: selectedBranchId,
        },
      });

      setTables(response.data?.tables || []);
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to load tables.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTables();
  }, [selectedBranchId]);

  /*
  |--------------------------------------------------------------------------
  | FILTER TABLES
  |--------------------------------------------------------------------------
  */

  const filteredTables = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tables.filter((table) => {
      const matchesSearch =
        !query ||
        String(table.number).includes(query) ||
        statusLabel(table.status)
          .toLowerCase()
          .includes(query);

      const matchesStatus =
        statusFilter === 'ALL' ||
        table.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [tables, search, statusFilter]);

  /*
  |--------------------------------------------------------------------------
  | STATISTICS
  |--------------------------------------------------------------------------
  */

  const stats = useMemo(() => {
    return {
      total: tables.length,
      available: tables.filter(
        (table) => table.status === 'AVAILABLE'
      ).length,
      occupied: tables.filter(
        (table) => table.status === 'OCCUPIED'
      ).length,
      reserved: tables.filter(
        (table) => table.status === 'RESERVED'
      ).length,
      cleaning: tables.filter(
        (table) => table.status === 'CLEANING'
      ).length,
      outOfService: tables.filter(
        (table) => table.status === 'OUT_OF_SERVICE'
      ).length,
    };
  }, [tables]);

  /*
  |--------------------------------------------------------------------------
  | FORM
  |--------------------------------------------------------------------------
  */

  function openCreate() {
    setEditingTable(null);

    setForm({
      number: '',
      capacity: '',
      branchId: selectedBranchId,
    });

    setError('');
    setShowForm(true);
  }

  function openEdit(table: RestaurantTable) {
    setEditingTable(table);

    setForm({
      number: String(table.number),
      capacity: String(table.capacity),
      branchId: table.branchId,
    });

    setError('');
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingTable(null);
  }

  /*
  |--------------------------------------------------------------------------
  | SAVE TABLE
  |--------------------------------------------------------------------------
  */

  async function saveTable() {
    setError('');

    const number = Number(form.number);
    const capacity = Number(form.capacity);

    if (!form.branchId) {
      setError('Please select a branch.');
      return;
    }

    if (
      !Number.isInteger(number) ||
      number <= 0
    ) {
      setError(
        'Table number must be a positive whole number.'
      );
      return;
    }

    if (
      !Number.isInteger(capacity) ||
      capacity <= 0
    ) {
      setError(
        'Capacity must be a positive whole number.'
      );
      return;
    }

    setSaving(true);

    try {
      if (editingTable) {
        await api.put(
          `/tables/${editingTable.id}`,
          {
            number,
            capacity,
          }
        );
      } else {
        await api.post('/tables', {
          number,
          capacity,
          branchId: form.branchId,
        });
      }

      setShowForm(false);
      setEditingTable(null);

      await loadTables();
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to save table.'
      );
    } finally {
      setSaving(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | STATUS
  |--------------------------------------------------------------------------
  */

  function openStatusModal(table: RestaurantTable) {
    setStatusTable(table);
    setStatusValue(table.status);
    setError('');
  }

  function closeStatusModal() {
    if (statusSaving) return;

    setStatusTable(null);
  }

  async function updateStatus() {
    if (!statusTable) return;

    setStatusSaving(true);
    setError('');

    try {
      await api.patch(
        `/tables/${statusTable.id}/status`,
        {
          status: statusValue,
        }
      );

      setStatusTable(null);

      await loadTables();
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to update table status.'
      );
    } finally {
      setStatusSaving(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | QR CODE
  |--------------------------------------------------------------------------
  */

  async function openQr(table: RestaurantTable) {
    setQrTable(table);
    setQrDataUrl('');
    setQrLoading(true);

    try {
      /*
       * This is the permanent URL for this physical table.
       *
       * Example:
       * http://localhost:5173/order?tableId=TABLE_UUID
       *
       * When deployed:
       * https://your-restaurant-domain.com/order?tableId=TABLE_UUID
       */

      const url =
        `${window.location.origin}/order?tableId=${encodeURIComponent(
          table.id
        )}`;

      const dataUrl = await QRCode.toDataURL(url, {
        width: 600,
        margin: 2,
        errorCorrectionLevel: 'H',
      });

      setQrDataUrl(dataUrl);
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to generate QR code.'
      );
    } finally {
      setQrLoading(false);
    }
  }

  function getQrUrl(table: RestaurantTable) {
    return `${window.location.origin}/order?tableId=${encodeURIComponent(
      table.id
    )}`;
  }

  function downloadQr() {
    if (!qrTable || !qrDataUrl) return;

    const link = document.createElement('a');

    link.href = qrDataUrl;
    link.download = `table-${qrTable.number}-qr.png`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function printQr() {
    if (!qrTable || !qrDataUrl) return;

    const printWindow = window.open(
      '',
      '_blank',
      'width=500,height=700'
    );

    if (!printWindow) {
      setError(
        'Please allow pop-ups to print the QR code.'
      );
      return;
    }

    const branch = branches.find(
      (item) => item.id === qrTable.branchId
    );

    const url = getQrUrl(qrTable);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Table ${qrTable.number} QR</title>
          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 30px;
              font-family: Arial, sans-serif;
              text-align: center;
            }

            .card {
              width: 100%;
              max-width: 420px;
              margin: 0 auto;
              border: 1px solid #ddd;
              border-radius: 18px;
              padding: 30px;
            }

            h1 {
              margin: 0 0 8px;
              font-size: 28px;
            }

            h2 {
              margin: 0 0 20px;
              font-size: 22px;
            }

            img {
              width: 300px;
              height: 300px;
              max-width: 100%;
            }

            .instruction {
              margin-top: 20px;
              font-size: 17px;
              font-weight: bold;
            }

            .url {
              margin-top: 15px;
              font-size: 10px;
              color: #666;
              word-break: break-all;
            }

            @media print {
              body {
                padding: 0;
              }

              .card {
                border: none;
              }
            }
          </style>
        </head>

        <body>
          <div class="card">

            <h1>
              ${branch?.name || "Sam's Cafe"}
            </h1>

            <h2>
              Table ${qrTable.number}
            </h2>

            <img
              src="${qrDataUrl}"
              alt="Table ${qrTable.number} QR Code"
            />

            <div class="instruction">
              Scan to view menu & place your order
            </div>

            <div class="url">
              ${url}
            </div>

          </div>

          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div className="min-h-screen bg-cream p-4 md:p-6">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div>
          <h1 className="font-serif text-3xl font-bold text-coffee-dark">
            Tables
          </h1>

          <p className="mt-1 text-sm text-coffee/60">
            Manage restaurant tables, sessions and QR ordering.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">

          <button
            type="button"
            onClick={loadTables}
            disabled={loading}
            className="rounded-xl border border-coffee/15 bg-white px-4 py-2 text-sm font-semibold text-coffee-dark hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={openCreate}
            className="rounded-xl bg-turmeric px-5 py-2 text-sm font-bold text-coffee-dark hover:bg-turmeric-deep"
          >
            + Add Table
          </button>

        </div>
      </div>


      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">

          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError('')}
            className="font-bold"
          >
            ×
          </button>

        </div>
      )}


      {/* =====================================================
          BRANCH
      ===================================================== */}

      <div className="mb-5 rounded-2xl border border-coffee/10 bg-white p-4 shadow-sm">

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">

          <div>
            <div className="text-sm font-semibold text-coffee-dark">
              Branch
            </div>

            <div className="text-xs text-coffee/50">
              Tables are isolated by branch.
            </div>
          </div>

          {isSuperAdmin ? (
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                setStatusFilter('ALL');
                setSearch('');
              }}
              disabled={branchesLoading}
              className="min-w-[260px] rounded-xl border border-coffee/15 px-3 py-2 text-sm outline-none focus:border-turmeric"
            >
              <option value="">
                Select branch
              </option>

              {branches.map((branch) => (
                <option
                  key={branch.id}
                  value={branch.id}
                >
                  {branch.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-xl bg-gray-50 px-4 py-2 text-sm font-semibold text-coffee-dark">
              {branches.find(
                (branch) =>
                  branch.id === selectedBranchId
              )?.name ||
                'Assigned branch'}
            </div>
          )}

        </div>
      </div>


      {/* =====================================================
          STATS
      ===================================================== */}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-xs text-coffee/50">
            Total
          </div>
          <div className="mt-1 text-2xl font-bold text-coffee-dark">
            {stats.total}
          </div>
        </div>

        <div className="rounded-2xl bg-green-50 p-4">
          <div className="text-xs text-green-700">
            Available
          </div>
          <div className="mt-1 text-2xl font-bold text-green-800">
            {stats.available}
          </div>
        </div>

        <div className="rounded-2xl bg-blue-50 p-4">
          <div className="text-xs text-blue-700">
            Occupied
          </div>
          <div className="mt-1 text-2xl font-bold text-blue-800">
            {stats.occupied}
          </div>
        </div>

        <div className="rounded-2xl bg-purple-50 p-4">
          <div className="text-xs text-purple-700">
            Reserved
          </div>
          <div className="mt-1 text-2xl font-bold text-purple-800">
            {stats.reserved}
          </div>
        </div>

        <div className="rounded-2xl bg-yellow-50 p-4">
          <div className="text-xs text-yellow-700">
            Cleaning
          </div>
          <div className="mt-1 text-2xl font-bold text-yellow-800">
            {stats.cleaning}
          </div>
        </div>

        <div className="rounded-2xl bg-red-50 p-4">
          <div className="text-xs text-red-700">
            Out of Service
          </div>
          <div className="mt-1 text-2xl font-bold text-red-800">
            {stats.outOfService}
          </div>
        </div>

      </div>


      {/* =====================================================
          FILTERS
      ===================================================== */}

      <div className="mb-5 rounded-2xl border border-coffee/10 bg-white p-4 shadow-sm">

        <div className="grid gap-3 md:grid-cols-[1fr_220px]">

          <input
            type="text"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Search by table number or status..."
            className="rounded-xl border border-coffee/15 px-4 py-2.5 text-sm outline-none focus:border-turmeric"
          />

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as 'ALL' | TableStatus
              )
            }
            className="rounded-xl border border-coffee/15 px-4 py-2.5 text-sm outline-none focus:border-turmeric"
          >
            <option value="ALL">
              All statuses
            </option>

            {STATUS_OPTIONS.map((status) => (
              <option
                key={status}
                value={status}
              >
                {statusLabel(status)}
              </option>
            ))}
          </select>

        </div>
      </div>


      {/* =====================================================
          EMPTY / LOADING
      ===================================================== */}

      {!selectedBranchId ? (
        <div className="rounded-2xl border border-dashed border-coffee/20 bg-white p-12 text-center">

          <div className="text-4xl">
            🪑
          </div>

          <h2 className="mt-3 text-lg font-bold text-coffee-dark">
            Select a branch
          </h2>

          <p className="mt-1 text-sm text-coffee/50">
            Select a branch to view its tables.
          </p>

        </div>
      ) : loading && tables.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-sm">

          <div className="text-sm text-coffee/60">
            Loading tables...
          </div>

        </div>
      ) : filteredTables.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-coffee/20 bg-white p-12 text-center">

          <div className="text-4xl">
            🪑
          </div>

          <h2 className="mt-3 text-lg font-bold text-coffee-dark">
            No tables found
          </h2>

          <p className="mt-1 text-sm text-coffee/50">
            {tables.length === 0
              ? 'Add your first table to this branch.'
              : 'Try changing your search or status filter.'}
          </p>

          {tables.length === 0 && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-5 rounded-xl bg-turmeric px-5 py-2 text-sm font-bold text-coffee-dark"
            >
              + Add First Table
            </button>
          )}

        </div>
      ) : (

        /* =====================================================
           TABLE GRID
        ===================================================== */

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">

          {filteredTables.map((table) => {

            const openSession =
              table.sessions?.find(
                (session) =>
                  session.status === 'OPEN'
              );

            const openOrders =
              openSession?.orders || [];

            const openBills =
              openSession?.bills || [];

            return (
              <div
                key={table.id}
                className="overflow-hidden rounded-2xl border border-coffee/10 bg-white shadow-sm"
              >

                {/* Card Header */}

                <div className="flex items-start justify-between gap-3 border-b border-coffee/10 p-4">

                  <div>
                    <div className="text-xs text-coffee/50">
                      Table
                    </div>

                    <div className="text-3xl font-bold text-coffee-dark">
                      {table.number}
                    </div>

                    <div className="mt-1 text-xs text-coffee/50">
                      Capacity: {table.capacity} people
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(
                      table.status
                    )}`}
                  >
                    {statusLabel(table.status)}
                  </span>

                </div>


                {/* Session */}

                <div className="p-4">

                  {openSession ? (
                    <div className="rounded-xl bg-gray-50 p-3">

                      <div className="flex justify-between gap-3">

                        <span className="text-xs font-semibold text-coffee/60">
                          Active session
                        </span>

                        <span className="text-xs font-bold text-green-700">
                          OPEN
                        </span>

                      </div>

                      <div className="mt-2 text-xs text-coffee/60">
                        Opened {formatDate(openSession.openedAt)}
                      </div>

                      <div className="mt-2 flex gap-4 text-xs">

                        <span>
                          Orders:{' '}
                          <strong>
                            {openOrders.length}
                          </strong>
                        </span>

                        <span>
                          Bills:{' '}
                          <strong>
                            {openBills.length}
                          </strong>
                        </span>

                      </div>

                    </div>
                  ) : (
                    <div className="rounded-xl bg-gray-50 p-3 text-xs text-coffee/50">
                      No active table session
                    </div>
                  )}

                </div>


                {/* Actions */}

                <div className="grid grid-cols-2 gap-2 border-t border-coffee/10 p-4">

                  <button
                    type="button"
                    onClick={() =>
                      setDashboardTable(table)
                    }
                    className="rounded-xl border border-coffee/15 px-3 py-2 text-xs font-semibold text-coffee-dark hover:bg-gray-50"
                  >
                    Dashboard
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      openQr(table)
                    }
                    className="rounded-xl bg-coffee-dark px-3 py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    QR Code
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      openEdit(table)
                    }
                    disabled={
                      table.status === 'OCCUPIED'
                    }
                    className="rounded-xl border border-coffee/15 px-3 py-2 text-xs font-semibold text-coffee-dark hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      openStatusModal(table)
                    }
                    className="rounded-xl border border-coffee/15 px-3 py-2 text-xs font-semibold text-coffee-dark hover:bg-gray-50"
                  >
                    Status
                  </button>

                </div>

              </div>
            );
          })}

        </div>
      )}


      {/* =====================================================
          ADD / EDIT MODAL
      ===================================================== */}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-coffee/10 p-5">

              <div>
                <h2 className="text-xl font-bold text-coffee-dark">
                  {editingTable
                    ? 'Edit Table'
                    : 'Add New Table'}
                </h2>

                <p className="mt-1 text-xs text-coffee/50">
                  {editingTable
                    ? 'Update the table details.'
                    : 'Create a new physical restaurant table.'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="text-2xl text-coffee/50 hover:text-coffee-dark"
              >
                ×
              </button>

            </div>

            <div className="space-y-4 p-5">

              {!editingTable && isSuperAdmin && (
                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Branch
                  </label>

                  <select
                    value={form.branchId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        branchId: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-coffee/15 px-3 py-2.5 text-sm"
                  >
                    <option value="">
                      Select branch
                    </option>

                    {branches.map((branch) => (
                      <option
                        key={branch.id}
                        value={branch.id}
                      >
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Table Number
                </label>

                <input
                  type="number"
                  min="1"
                  value={form.number}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      number: e.target.value,
                    })
                  }
                  placeholder="Example: 12"
                  className="w-full rounded-xl border border-coffee/15 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Capacity
                </label>

                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      capacity: e.target.value,
                    })
                  }
                  placeholder="Example: 4"
                  className="w-full rounded-xl border border-coffee/15 px-3 py-2.5 text-sm"
                />
              </div>

              {editingTable && (
                <div className="rounded-xl bg-blue-50 p-3 text-xs text-blue-700">
                  The table's permanent ID and QR identity will not change
                  when you edit the table number or capacity.
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

            </div>

            <div className="flex justify-end gap-2 border-t border-coffee/10 p-5">

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-xl border border-coffee/15 px-5 py-2 text-sm font-semibold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveTable}
                disabled={saving}
                className="rounded-xl bg-turmeric px-5 py-2 text-sm font-bold text-coffee-dark disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : editingTable
                  ? 'Save Changes'
                  : 'Create Table'}
              </button>

            </div>

          </div>
        </div>
      )}


      {/* =====================================================
          STATUS MODAL
      ===================================================== */}

      {statusTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">

            <div className="border-b border-coffee/10 p-5">

              <h2 className="text-xl font-bold text-coffee-dark">
                Table {statusTable.number} Status
              </h2>

              <p className="mt-1 text-xs text-coffee/50">
                Change the operational status of this table.
              </p>

            </div>

            <div className="p-5">

              <select
                value={statusValue}
                onChange={(e) =>
                  setStatusValue(
                    e.target.value as TableStatus
                  )
                }
                className="w-full rounded-xl border border-coffee/15 px-3 py-3 text-sm"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {statusLabel(status)}
                  </option>
                ))}
              </select>

              {statusValue === 'AVAILABLE' && (
                <div className="mt-3 rounded-xl bg-yellow-50 p-3 text-xs text-yellow-800">
                  A table with an open session cannot be manually marked
                  Available. Complete the session/payment first.
                </div>
              )}

            </div>

            <div className="flex justify-end gap-2 border-t border-coffee/10 p-5">

              <button
                type="button"
                onClick={closeStatusModal}
                disabled={statusSaving}
                className="rounded-xl border border-coffee/15 px-5 py-2 text-sm font-semibold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={updateStatus}
                disabled={statusSaving}
                className="rounded-xl bg-coffee-dark px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {statusSaving
                  ? 'Updating...'
                  : 'Update Status'}
              </button>

            </div>

          </div>
        </div>
      )}


      {/* =====================================================
          TABLE DASHBOARD MODAL
      ===================================================== */}

      {dashboardTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-coffee/10 p-5">

              <div>
                <h2 className="text-2xl font-bold text-coffee-dark">
                  Table {dashboardTable.number}
                </h2>

                <p className="text-sm text-coffee/50">
                  Table operational dashboard
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setDashboardTable(null)
                }
                className="text-2xl text-coffee/50"
              >
                ×
              </button>

            </div>

            <div className="space-y-5 p-5">

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">

                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs text-coffee/50">
                    Table
                  </div>

                  <div className="mt-1 text-xl font-bold">
                    #{dashboardTable.number}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs text-coffee/50">
                    Capacity
                  </div>

                  <div className="mt-1 text-xl font-bold">
                    {dashboardTable.capacity}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs text-coffee/50">
                    Status
                  </div>

                  <div className="mt-1 text-sm font-bold">
                    {statusLabel(
                      dashboardTable.status
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs text-coffee/50">
                    Session
                  </div>

                  <div className="mt-1 text-sm font-bold">
                    {dashboardTable.sessions?.some(
                      (session) =>
                        session.status === 'OPEN'
                    )
                      ? 'OPEN'
                      : 'NONE'}
                  </div>
                </div>

              </div>


              {dashboardTable.sessions?.find(
                (session) =>
                  session.status === 'OPEN'
              ) ? (
                (() => {
                  const session =
                    dashboardTable.sessions?.find(
                      (item) =>
                        item.status === 'OPEN'
                    );

                  if (!session) return null;

                  return (
                    <div>

                      <h3 className="mb-3 font-bold text-coffee-dark">
                        Active Session
                      </h3>

                      <div className="rounded-xl border border-coffee/10 p-4">

                        <div className="grid gap-3 md:grid-cols-2">

                          <div>
                            <div className="text-xs text-coffee/50">
                              Session ID
                            </div>

                            <div className="mt-1 break-all text-xs font-mono">
                              {session.id}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-coffee/50">
                              Opened
                            </div>

                            <div className="mt-1 text-sm">
                              {formatDate(
                                session.openedAt
                              )}
                            </div>
                          </div>

                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">

                          <div className="rounded-xl bg-gray-50 p-3">

                            <div className="text-xs font-semibold text-coffee/60">
                              Orders
                            </div>

                            <div className="mt-2 text-2xl font-bold">
                              {session.orders?.length || 0}
                            </div>

                          </div>

                          <div className="rounded-xl bg-gray-50 p-3">

                            <div className="text-xs font-semibold text-coffee/60">
                              Bills
                            </div>

                            <div className="mt-2 text-2xl font-bold">
                              {session.bills?.length || 0}
                            </div>

                          </div>

                        </div>

                        {session.orders &&
                          session.orders.length > 0 && (
                            <div className="mt-4">

                              <div className="mb-2 text-sm font-bold">
                                Recent Orders
                              </div>

                              <div className="space-y-2">

                                {session.orders.map(
                                  (order) => (
                                    <div
                                      key={order.id}
                                      className="flex items-center justify-between rounded-lg border border-coffee/10 p-3 text-sm"
                                    >
                                      <div>
                                        <div className="font-semibold">
                                          Order #
                                          {order.orderNumber}
                                        </div>

                                        <div className="text-xs text-coffee/50">
                                          {order.status} ·{' '}
                                          {formatDate(
                                            order.createdAt
                                          )}
                                        </div>
                                      </div>

                                      <div className="font-bold">
                                        {money(order.total)}
                                      </div>
                                    </div>
                                  )
                                )}

                              </div>

                            </div>
                          )}

                      </div>

                    </div>
                  );
                })()
              ) : (
                <div className="rounded-xl bg-gray-50 p-5 text-center text-sm text-coffee/50">
                  There is currently no open session for this table.
                </div>
              )}

            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-coffee/10 p-5">

              <button
                type="button"
                onClick={() =>
                  openQr(dashboardTable)
                }
                className="rounded-xl bg-coffee-dark px-5 py-2 text-sm font-bold text-white"
              >
                View QR
              </button>

              <button
                type="button"
                onClick={() =>
                  setDashboardTable(null)
                }
                className="rounded-xl border border-coffee/15 px-5 py-2 text-sm font-semibold"
              >
                Close
              </button>

            </div>

          </div>
        </div>
      )}


      {/* =====================================================
          QR MODAL
      ===================================================== */}

      {qrTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">

          <div className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-coffee/10 p-5">

              <div>
                <h2 className="text-xl font-bold text-coffee-dark">
                  Table {qrTable.number} QR Code
                </h2>

                <p className="mt-1 text-xs text-coffee/50">
                  Customers scan this code to order from this table.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setQrTable(null);
                  setQrDataUrl('');
                }}
                className="text-2xl text-coffee/50"
              >
                ×
              </button>

            </div>

            <div className="p-6 text-center">

              {qrLoading ? (
                <div className="py-16 text-sm text-coffee/50">
                  Generating QR code...
                </div>
              ) : qrDataUrl ? (
                <>
                  <div className="mx-auto w-fit rounded-2xl border border-coffee/10 bg-white p-4 shadow-sm">

                    <img
                      src={qrDataUrl}
                      alt={`QR code for table ${qrTable.number}`}
                      className="h-72 w-72 md:h-80 md:w-80"
                    />

                  </div>

                  <div className="mt-5">

                    <div className="text-lg font-bold text-coffee-dark">
                      Table {qrTable.number}
                    </div>

                    <div className="mt-1 text-sm text-coffee/50">
                      Scan to view menu and place order
                    </div>

                  </div>

                  <div className="mt-4 rounded-xl bg-gray-50 p-3 text-left">

                    <div className="text-xs font-semibold text-coffee/60">
                      Table-specific ordering URL
                    </div>

                    <div className="mt-2 break-all text-xs text-coffee/70">
                      {getQrUrl(qrTable)}
                    </div>

                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">

                    <button
                      type="button"
                      onClick={downloadQr}
                      className="rounded-xl bg-turmeric px-4 py-3 text-sm font-bold text-coffee-dark"
                    >
                      Download PNG
                    </button>

                    <button
                      type="button"
                      onClick={printQr}
                      className="rounded-xl bg-coffee-dark px-4 py-3 text-sm font-bold text-white"
                    >
                      Print QR
                    </button>

                  </div>

                </>
              ) : (
                <div className="py-16 text-sm text-red-600">
                  QR code could not be generated.
                </div>
              )}

            </div>

          </div>
        </div>
      )}

    </div>
  );
}