import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { api } from '../../api/client';

type BranchStatus =
  | 'OPENING_SOON'
  | 'OPEN'
  | 'CLOSED'
  | 'TEMPORARILY_CLOSED'
  | 'PERMANENTLY_CLOSED';

type Employee = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  loginId?: string | null;
  role: string;
  department?: string | null;
  status: string;
  joiningDate?: string | null;
};

type Branch = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  openingTime: string;
  closingTime: string;
  weeklyHoliday?: string | null;
  status: BranchStatus;
  manager?: Employee | null;
  employees?: Employee[];
  _count?: {
    employees: number;
    categories: number;
    items: number;
    tables: number;
    orders: number;
  };
};

type BranchForm = {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  openingTime: string;
  closingTime: string;
  weeklyHoliday: string;
};

const STATUS_OPTIONS: Array<{
  value: BranchStatus;
  label: string;
}> = [
  {
    value: 'OPENING_SOON',
    label: 'Opening Soon',
  },
  {
    value: 'OPEN',
    label: 'Open',
  },
  {
    value: 'CLOSED',
    label: 'Closed',
  },
  {
    value: 'TEMPORARILY_CLOSED',
    label: 'Temporarily Closed',
  },
  {
    value: 'PERMANENTLY_CLOSED',
    label: 'Permanently Closed',
  },
];

const EMPTY_FORM: BranchForm = {
  name: '',
  address: '',
  city: '',
  state: '',
  country: 'India',
  phone: '',
  email: '',
  openingTime: '09:00',
  closingTime: '22:00',
  weeklyHoliday: '',
};

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.message ||
      error.response?.data?.error ||
      fallback
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function statusLabel(status: BranchStatus) {
  return (
    STATUS_OPTIONS.find(
      (item) => item.value === status,
    )?.label || status
  );
}

function statusClass(status: BranchStatus) {
  switch (status) {
    case 'OPEN':
      return 'bg-green-100 text-green-700';

    case 'OPENING_SOON':
      return 'bg-blue-100 text-blue-700';

    case 'TEMPORARILY_CLOSED':
      return 'bg-yellow-100 text-yellow-700';

    case 'CLOSED':
      return 'bg-gray-100 text-gray-700';

    case 'PERMANENTLY_CLOSED':
      return 'bg-red-100 text-red-700';

    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dashboardBranch, setDashboardBranch] = useState<Branch | null>(null);
  const [managers, setManagers] = useState<Employee[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState('');

  const [search, setSearch] = useState('');

  const [statusFilter, setStatusFilter] = useState<
    BranchStatus | 'ALL'
  >('ALL');

  const [showForm, setShowForm] = useState(false);

  const [editingBranch, setEditingBranch] =
    useState<Branch | null>(null);

  const [form, setForm] =
    useState<BranchForm>(EMPTY_FORM);

  const [saving, setSaving] = useState(false);

  const [selectedBranch, setSelectedBranch] =
    useState<Branch | null>(null);

  const [statusBranch, setStatusBranch] =
    useState<Branch | null>(null);

  const [selectedStatus, setSelectedStatus] =
    useState<BranchStatus>('OPEN');

  const [managerBranch, setManagerBranch] =
    useState<Branch | null>(null);

  const [selectedManagerId, setSelectedManagerId] =
    useState('');

  const [actionLoading, setActionLoading] =
    useState(false);

  // ============================================================
  // LOAD BRANCHES
  // ============================================================

  async function loadBranches(
    showRefresh = false,
  ) {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      // IMPORTANT:
      // Use the authenticated api client.
      // Do NOT use axios.get directly here.
      const response = await api.get('/branches');

      const data: Branch[] =
        response.data?.branches || [];

      setBranches(data);
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          'Unable to load branches.',
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ============================================================
  // LOAD MANAGERS
  // ============================================================

  async function loadManagers() {
    try {
      // Authenticated API request
      const response = await api.get('/employees');

      const employees: Employee[] =
        response.data?.employees || [];

      setManagers(
        employees.filter(
          (employee) =>
            employee.role === 'MANAGER' &&
            employee.status === 'ACTIVE',
        ),
      );
    } catch {
      setManagers([]);
    }
  }

  useEffect(() => {
    void loadBranches();
    void loadManagers();
  }, []);

  // ============================================================
  // FILTERED BRANCHES
  // ============================================================

  const filteredBranches = useMemo(() => {
    const query = search.trim().toLowerCase();

    return branches.filter((branch) => {
      const matchesSearch =
        !query ||
        branch.name
          .toLowerCase()
          .includes(query) ||
        branch.city
          .toLowerCase()
          .includes(query) ||
        branch.state
          .toLowerCase()
          .includes(query) ||
        branch.phone
          .toLowerCase()
          .includes(query) ||
        branch.email
          .toLowerCase()
          .includes(query);

      const matchesStatus =
        statusFilter === 'ALL' ||
        branch.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [
    branches,
    search,
    statusFilter,
  ]);

  // ============================================================
  // STATISTICS
  // ============================================================

  const stats = useMemo(() => {
    return {
      total: branches.length,

      open: branches.filter(
        (branch) => branch.status === 'OPEN',
      ).length,

      temporarilyClosed: branches.filter(
        (branch) =>
          branch.status ===
          'TEMPORARILY_CLOSED',
      ).length,

      closed: branches.filter(
        (branch) =>
          branch.status === 'CLOSED' ||
          branch.status ===
            'PERMANENTLY_CLOSED',
      ).length,
    };
  }, [branches]);

  // ============================================================
  // FORM
  // ============================================================

  function openCreateForm() {
    setEditingBranch(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  }

  function openEditForm(branch: Branch) {
    setEditingBranch(branch);

    setForm({
      name: branch.name || '',
      address: branch.address || '',
      city: branch.city || '',
      state: branch.state || '',
      country: branch.country || 'India',
      phone: branch.phone || '',
      email: branch.email || '',
      openingTime:
        branch.openingTime || '09:00',
      closingTime:
        branch.closingTime || '22:00',
      weeklyHoliday:
        branch.weeklyHoliday || '',
    });

    setError('');
    setShowForm(true);
  }

  function updateForm(
    field: keyof BranchForm,
    value: string,
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function validateForm() {
    if (!form.name.trim()) {
      return 'Branch name is required.';
    }

    if (!form.address.trim()) {
      return 'Address is required.';
    }

    if (!form.city.trim()) {
      return 'City is required.';
    }

    if (!form.state.trim()) {
      return 'State is required.';
    }

    if (!form.country.trim()) {
      return 'Country is required.';
    }

    if (!form.phone.trim()) {
      return 'Phone number is required.';
    }

    if (
      !/^[0-9+\-\s()]{5,30}$/.test(
        form.phone.trim(),
      )
    ) {
      return 'Please enter a valid phone number.';
    }

    if (!form.email.trim()) {
      return 'Email is required.';
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email.trim(),
      )
    ) {
      return 'Please enter a valid email address.';
    }

    if (!form.openingTime) {
      return 'Opening time is required.';
    }

    if (!form.closingTime) {
      return 'Closing time is required.';
    }

    return '';
  }

  // ============================================================
  // CREATE / UPDATE BRANCH
  // ============================================================

  async function saveBranch(
    event: FormEvent,
  ) {
    event.preventDefault();

    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        openingTime: form.openingTime,
        closingTime: form.closingTime,
        weeklyHoliday:
          form.weeklyHoliday.trim() ||
          undefined,
      };

      if (editingBranch) {
        // Authenticated PUT request
        await api.put(
          `/branches/${editingBranch.id}`,
          payload,
        );
      } else {
        // Authenticated POST request
        await api.post(
          '/branches',
          payload,
        );
      }

      setShowForm(false);
      setEditingBranch(null);
      setForm(EMPTY_FORM);

      await loadBranches();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          editingBranch
            ? 'Unable to update branch.'
            : 'Unable to create branch.',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  // ============================================================
  // STATUS
  // ============================================================

  function openStatusModal(
    branch: Branch,
  ) {
    setStatusBranch(branch);
    setSelectedStatus(branch.status);
  }

  async function updateStatus() {
    if (!statusBranch) {
      return;
    }

    try {
      setActionLoading(true);
      setError('');

      // Authenticated PATCH request
      await api.patch(
        `/branches/${statusBranch.id}/status`,
        {
          status: selectedStatus,
        },
      );

      setStatusBranch(null);

      await loadBranches();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          'Unable to update branch status.',
        ),
      );
    } finally {
      setActionLoading(false);
    }
  }

  // ============================================================
  // MANAGER
  // ============================================================

  function openManagerModal(
    branch: Branch,
  ) {
    setManagerBranch(branch);

    setSelectedManagerId(
      branch.manager?.id || '',
    );
  }

  async function assignManager() {
    if (
      !managerBranch ||
      !selectedManagerId
    ) {
      setError(
        'Please select a manager.',
      );
      return;
    }

    try {
      setActionLoading(true);
      setError('');

      // Authenticated POST request
      await api.post(
        `/branches/${managerBranch.id}/assign-manager`,
        {
          managerId: selectedManagerId,
        },
      );

      setManagerBranch(null);

      await loadBranches();
      await loadManagers();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          'Unable to assign branch manager.',
        ),
      );
    } finally {
      setActionLoading(false);
    }
  }

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-sm text-gray-500">
          Loading branches...
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6 p-4 md:p-6">

      {/* HEADER */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Branch Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage branches, managers, status
            and branch operations.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">

          <button
            type="button"
            onClick={() =>
              void loadBranches(true)
            }
            disabled={refreshing}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing
              ? 'Refreshing...'
              : '↻ Refresh'}
          </button>

          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            + Add New Branch
          </button>

        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>

          <button
            type="button"
            onClick={() =>
              setError('')
            }
            className="font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* STATS */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Branches
          </p>

          <p className="mt-2 text-3xl font-bold text-gray-900">
            {stats.total}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Open
          </p>

          <p className="mt-2 text-3xl font-bold text-green-600">
            {stats.open}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Temporarily Closed
          </p>

          <p className="mt-2 text-3xl font-bold text-yellow-600">
            {stats.temporarilyClosed}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Closed
          </p>

          <p className="mt-2 text-3xl font-bold text-red-600">
            {stats.closed}
          </p>
        </div>

      </div>

      {/* FILTERS */}

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm md:flex-row">

        <input
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Search branches..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-gray-500 md:flex-1"
        />

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as
                | BranchStatus
                | 'ALL',
            )
          }
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-gray-500"
        >
          <option value="ALL">
            All Statuses
          </option>

          {STATUS_OPTIONS.map(
            (status) => (
              <option
                key={status.value}
                value={status.value}
              >
                {status.label}
              </option>
            ),
          )}
        </select>

      </div>

      {/* BRANCHES */}

      {filteredBranches.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center shadow-sm">

          <div className="text-4xl">
            🏢
          </div>

          <h2 className="mt-3 text-lg font-semibold text-gray-900">
            No branches found
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Try changing your search/filter
            or create a new branch.
          </p>

        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

          {filteredBranches.map(
            (branch) => (
              <div
                key={branch.id}
                className="rounded-xl border bg-white p-5 shadow-sm"
              >

                {/* CARD HEADER */}

                <div className="flex items-start justify-between gap-4">

                  <div>
                    <div className="flex flex-wrap items-center gap-2">

                      <h2 className="text-lg font-bold text-gray-900">
                        {branch.name}
                      </h2>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                          branch.status,
                        )}`}
                      >
                        {statusLabel(
                          branch.status,
                        )}
                      </span>

                    </div>

                    <p className="mt-2 text-sm text-gray-500">
                      {branch.city},{' '}
                      {branch.state},{' '}
                      {branch.country}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedBranch(
                        branch,
                      )
                    }
                    className="rounded-lg border px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View
                  </button>

                </div>

                {/* DETAILS */}

                <div className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">

                  <div>
                    <span className="text-gray-400">
                      Address
                    </span>

                    <p className="mt-1 text-gray-700">
                      {branch.address}
                    </p>
                  </div>

                  <div>
                    <span className="text-gray-400">
                      Phone
                    </span>

                    <p className="mt-1 text-gray-700">
                      {branch.phone}
                    </p>
                  </div>

                  <div>
                    <span className="text-gray-400">
                      Email
                    </span>

                    <p className="mt-1 break-all text-gray-700">
                      {branch.email}
                    </p>
                  </div>

                  <div>
                    <span className="text-gray-400">
                      Hours
                    </span>

                    <p className="mt-1 text-gray-700">
                      {branch.openingTime}
                      {' - '}
                      {branch.closingTime}
                    </p>
                  </div>

                  <div>
                    <span className="text-gray-400">
                      Weekly Holiday
                    </span>

                    <p className="mt-1 text-gray-700">
                      {branch.weeklyHoliday ||
                        'Not set'}
                    </p>
                  </div>

                  <div>
                    <span className="text-gray-400">
                      Manager
                    </span>

                    <p className="mt-1 text-gray-700">
                      {branch.manager
                        ?.fullName ||
                        'Not assigned'}
                    </p>
                  </div>

                </div>

                {/* COUNTS */}

                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">

                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <p className="text-lg font-bold">
                      {branch._count
                        ?.employees || 0}
                    </p>

                    <p className="text-xs text-gray-500">
                      Employees
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <p className="text-lg font-bold">
                      {branch._count
                        ?.categories || 0}
                    </p>

                    <p className="text-xs text-gray-500">
                      Categories
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <p className="text-lg font-bold">
                      {branch._count?.items ||
                        0}
                    </p>

                    <p className="text-xs text-gray-500">
                      Items
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <p className="text-lg font-bold">
                      {branch._count?.tables ||
                        0}
                    </p>

                    <p className="text-xs text-gray-500">
                      Tables
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <p className="text-lg font-bold">
                      {branch._count?.orders ||
                        0}
                    </p>

                    <p className="text-xs text-gray-500">
                      Orders
                    </p>
                  </div>

                </div>

                {/* ACTIONS */}

                <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">

                  <button
                    type="button"
                    onClick={() =>
                      openEditForm(
                        branch,
                      )
                    }
                    className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    ✏️ Edit
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      openStatusModal(
                        branch,
                      )
                    }
                    className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    🔓 Status
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      openManagerModal(
                        branch,
                      )
                    }
                    className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    👤 Manager
                  </button>

                  <button
                    type="button"
                    onClick={() => setDashboardBranch(branch)}
                    className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                  >
                    📊 Dashboard
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedBranch(
                        branch,
                      )
                    }
                    className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    👥 Employees
                  </button>

                </div>

              </div>
            ),
          )}

        </div>
      )}

      {/* ======================================================
          ADD / EDIT BRANCH MODAL
          ====================================================== */}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">

            <div className="flex items-center justify-between border-b p-5">

              <div>
                <h2 className="text-xl font-bold">
                  {editingBranch
                    ? 'Edit Branch'
                    : 'Add New Branch'}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Enter the branch information below.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowForm(false)
                }
                className="text-2xl text-gray-400 hover:text-gray-700"
              >
                ×
              </button>

            </div>

            <form
              onSubmit={saveBranch}
              className="space-y-5 p-5"
            >

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

                {/* NAME */}

                <label className="md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">
                    Branch Name *
                  </span>

                  <input
                    value={form.name}
                    onChange={(event) =>
                      updateForm(
                        'name',
                        event.target.value,
                      )
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                    placeholder="Main Branch"
                  />
                </label>

                {/* ADDRESS */}

                <label className="md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">
                    Full Address *
                  </span>

                  <textarea
                    value={form.address}
                    onChange={(event) =>
                      updateForm(
                        'address',
                        event.target.value,
                      )
                    }
                    rows={3}
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                    placeholder="Street, area, building..."
                  />
                </label>

                {/* CITY */}

                <label>
                  <span className="text-sm font-medium text-gray-700">
                    City *
                  </span>

                  <input
                    value={form.city}
                    onChange={(event) =>
                      updateForm(
                        'city',
                        event.target.value,
                      )
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                  />
                </label>

                {/* STATE */}

                <label>
                  <span className="text-sm font-medium text-gray-700">
                    State *
                  </span>

                  <input
                    value={form.state}
                    onChange={(event) =>
                      updateForm(
                        'state',
                        event.target.value,
                      )
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                  />
                </label>

                {/* COUNTRY */}

                <label>
                  <span className="text-sm font-medium text-gray-700">
                    Country *
                  </span>

                  <input
                    value={form.country}
                    onChange={(event) =>
                      updateForm(
                        'country',
                        event.target.value,
                      )
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                  />
                </label>

                {/* PHONE */}

                <label>
                  <span className="text-sm font-medium text-gray-700">
                    Phone *
                  </span>

                  <input
                    value={form.phone}
                    onChange={(event) =>
                      updateForm(
                        'phone',
                        event.target.value,
                      )
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                    placeholder="+91 9876543210"
                  />
                </label>

                {/* EMAIL */}

                <label className="md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">
                    Email *
                  </span>

                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateForm(
                        'email',
                        event.target.value,
                      )
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                    placeholder="branch@example.com"
                  />
                </label>

                {/* OPENING */}

                <label>
                  <span className="text-sm font-medium text-gray-700">
                    Opening Time *
                  </span>

                  <input
                    type="time"
                    value={form.openingTime}
                    onChange={(event) =>
                      updateForm(
                        'openingTime',
                        event.target.value,
                      )
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                  />
                </label>

                {/* CLOSING */}

                <label>
                  <span className="text-sm font-medium text-gray-700">
                    Closing Time *
                  </span>

                  <input
                    type="time"
                    value={form.closingTime}
                    onChange={(event) =>
                      updateForm(
                        'closingTime',
                        event.target.value,
                      )
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                  />
                </label>

                {/* HOLIDAY */}

                <label className="md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">
                    Weekly Holiday
                  </span>

                  <select
                    value={form.weeklyHoliday}
                    onChange={(event) =>
                      updateForm(
                        'weeklyHoliday',
                        event.target.value,
                      )
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                  >
                    <option value="">
                      No fixed weekly holiday
                    </option>

                    <option value="Monday">
                      Monday
                    </option>

                    <option value="Tuesday">
                      Tuesday
                    </option>

                    <option value="Wednesday">
                      Wednesday
                    </option>

                    <option value="Thursday">
                      Thursday
                    </option>

                    <option value="Friday">
                      Friday
                    </option>

                    <option value="Saturday">
                      Saturday
                    </option>

                    <option value="Sunday">
                      Sunday
                    </option>
                  </select>
                </label>

              </div>

              {/* FORM BUTTONS */}

              <div className="flex justify-end gap-3 border-t pt-4">

                <button
                  type="button"
                  onClick={() =>
                    setShowForm(false)
                  }
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingBranch
                      ? 'Save Changes'
                      : 'Create Branch'}
                </button>

              </div>

            </form>
          </div>
        </div>
      )}

      {/* ======================================================
          STATUS MODAL
          ====================================================== */}

      {statusBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">

            <div className="border-b p-5">

              <h2 className="text-lg font-bold">
                Change Branch Status
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {statusBranch.name}
              </p>

            </div>

            <div className="space-y-2 p-5">

              {STATUS_OPTIONS.map(
                (status) => (
                  <label
                    key={status.value}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name="branch-status"
                      value={status.value}
                      checked={
                        selectedStatus ===
                        status.value
                      }
                      onChange={() =>
                        setSelectedStatus(
                          status.value,
                        )
                      }
                    />

                    <span className="text-sm font-medium">
                      {status.label}
                    </span>
                  </label>
                ),
              )}

            </div>

            <div className="flex justify-end gap-3 border-t p-5">

              <button
                type="button"
                onClick={() =>
                  setStatusBranch(null)
                }
                className="rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void updateStatus()
                }
                disabled={actionLoading}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {actionLoading
                  ? 'Updating...'
                  : 'Update Status'}
              </button>

            </div>

          </div>
        </div>
      )}

      {/* ======================================================
          MANAGER MODAL
          ====================================================== */}

      {managerBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">

            <div className="border-b p-5">

              <h2 className="text-lg font-bold">
                Assign Branch Manager
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {managerBranch.name}
              </p>

            </div>

            <div className="p-5">

              <label>

                <span className="text-sm font-medium text-gray-700">
                  Active Manager
                </span>

                <select
                  value={selectedManagerId}
                  onChange={(event) =>
                    setSelectedManagerId(
                      event.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-gray-500"
                >

                  <option value="">
                    Select Manager
                  </option>

                  {managers.map(
                    (manager) => (
                      <option
                        key={manager.id}
                        value={manager.id}
                      >
                        {manager.fullName}
                        {' — '}
                        {manager.loginId ||
                          manager.email ||
                          ''}
                      </option>
                    ),
                  )}

                </select>

              </label>

              {managers.length === 0 && (
                <p className="mt-3 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-700">
                  No active manager accounts
                  are currently available.
                </p>
              )}

            </div>

            <div className="flex justify-end gap-3 border-t p-5">

              <button
                type="button"
                onClick={() =>
                  setManagerBranch(null)
                }
                className="rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void assignManager()
                }
                disabled={
                  actionLoading ||
                  !selectedManagerId
                }
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {actionLoading
                  ? 'Assigning...'
                  : 'Assign Manager'}
              </button>

            </div>

          </div>
        </div>
      )}

      {/* ======================================================
          BRANCH DASHBOARD MODAL
          ====================================================== */}

      {dashboardBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900">
                    {dashboardBranch.name} Dashboard
                  </h2>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                      dashboardBranch.status,
                    )}`}
                  >
                    {statusLabel(dashboardBranch.status)}
                  </span>
                </div>

                <p className="mt-1 text-sm text-gray-500">
                  Branch operations overview and quick access.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDashboardBranch(null)}
                className="text-2xl text-gray-400 hover:text-gray-700"
                aria-label="Close branch dashboard"
              >
                ×
              </button>
            </div>

            <div className="space-y-6 p-5">
              {/* OPERATIONAL SUMMARY */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">
                    Operational Summary
                  </h3>

                  <button
                    type="button"
                    onClick={() => {
                      setDashboardBranch(null);
                      void loadBranches(true);
                    }}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-50"
                  >
                    ↻ Refresh Data
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Employees</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {dashboardBranch._count?.employees || 0}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Categories</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {dashboardBranch._count?.categories || 0}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Menu Items</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {dashboardBranch._count?.items || 0}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Tables</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {dashboardBranch._count?.tables || 0}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">Orders</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {dashboardBranch._count?.orders || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* BRANCH OPERATING INFORMATION */}
              <div className="rounded-xl border p-5">
                <h3 className="mb-4 font-semibold text-gray-900">
                  Branch Operating Information
                </h3>

                <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-gray-400">Manager</p>
                    <p className="mt-1 font-medium text-gray-800">
                      {dashboardBranch.manager?.fullName || "Not assigned"}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-400">Phone</p>
                    <p className="mt-1 font-medium text-gray-800">
                      {dashboardBranch.phone || "Not set"}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-400">Opening Hours</p>
                    <p className="mt-1 font-medium text-gray-800">
                      {dashboardBranch.openingTime} - {dashboardBranch.closingTime}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-400">Weekly Holiday</p>
                    <p className="mt-1 font-medium text-gray-800">
                      {dashboardBranch.weeklyHoliday || "No fixed holiday"}
                    </p>
                  </div>

                  <div className="md:col-span-2 lg:col-span-4">
                    <p className="text-gray-400">Address</p>
                    <p className="mt-1 font-medium text-gray-800">
                      {dashboardBranch.address}, {dashboardBranch.city},{" "}
                      {dashboardBranch.state}, {dashboardBranch.country}
                    </p>
                  </div>
                </div>
              </div>

              {/* EMPLOYEE SNAPSHOT */}
              <div className="rounded-xl border p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Branch Employees
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Current employees assigned to this branch.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBranch(dashboardBranch);
                      setDashboardBranch(null);
                    }}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-50"
                  >
                    View Employees
                  </button>
                </div>

                {!dashboardBranch.employees ||
                dashboardBranch.employees.length === 0 ? (
                  <div className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">
                    No employees are currently assigned to this branch.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3">Employee</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Department</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y">
                        {dashboardBranch.employees.slice(0, 8).map((employee) => (
                          <tr key={employee.id}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-800">
                                {employee.fullName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {employee.phone ||
                                  employee.email ||
                                  employee.loginId ||
                                  "No contact"}
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              {employee.role}
                            </td>

                            <td className="px-4 py-3">
                              {employee.department || "—"}
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                  employee.status === "ACTIVE"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {employee.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {dashboardBranch.employees.length > 8 && (
                      <div className="border-t bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
                        Showing 8 of {dashboardBranch.employees.length} employees.
                        Use "View Employees" for the complete list.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* QUICK ACCESS */}
              <div>
                <h3 className="mb-3 font-semibold text-gray-900">
                  Quick Access
                </h3>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => {
                      setDashboardBranch(null);
                      window.location.href = "/staff/orders";
                    }}
                    className="rounded-xl border p-4 text-left hover:bg-gray-50"
                  >
                    <div className="text-lg">🧾</div>
                    <p className="mt-2 font-semibold">Orders</p>
                    <p className="mt-1 text-xs text-gray-500">
                      View and process branch orders.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDashboardBranch(null);
                      window.location.href = "/staff/pos";
                    }}
                    className="rounded-xl border p-4 text-left hover:bg-gray-50"
                  >
                    <div className="text-lg">▣</div>
                    <p className="mt-2 font-semibold">POS</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Create dine-in and takeaway orders.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDashboardBranch(null);
                      window.location.href = "/staff/billing";
                    }}
                    className="rounded-xl border p-4 text-left hover:bg-gray-50"
                  >
                    <div className="text-lg">₹</div>
                    <p className="mt-2 font-semibold">Billing</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Generate bills and record payments.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDashboardBranch(null);
                      window.location.href = "/staff/kitchen";
                    }}
                    className="rounded-xl border p-4 text-left hover:bg-gray-50"
                  >
                    <div className="text-lg">♨</div>
                    <p className="mt-2 font-semibold">Kitchen</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Monitor kitchen order progress.
                    </p>
                  </button>
                </div>
              </div>

              {/* DASHBOARD FOOTER */}
              <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setDashboardBranch(null);
                    openEditForm(dashboardBranch);
                  }}
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  ✏️ Edit Branch
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDashboardBranch(null);
                    openStatusModal(dashboardBranch);
                  }}
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  🔓 Change Status
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardBranch(null)}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  Close Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          BRANCH DETAILS MODAL
          ====================================================== */}

      {selectedBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl">

            <div className="flex items-start justify-between border-b p-5">

              <div>

                <div className="flex flex-wrap items-center gap-2">

                  <h2 className="text-xl font-bold">
                    {selectedBranch.name}
                  </h2>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                      selectedBranch.status,
                    )}`}
                  >
                    {statusLabel(
                      selectedBranch.status,
                    )}
                  </span>

                </div>

                <p className="mt-1 text-sm text-gray-500">
                  Branch details and employees
                </p>

              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedBranch(null)
                }
                className="text-2xl text-gray-400 hover:text-gray-700"
              >
                ×
              </button>

            </div>

            <div className="space-y-6 p-5">

              {/* BASIC DETAILS */}

              <div>

                <h3 className="mb-3 font-semibold">
                  Branch Information
                </h3>

                <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">

                  <div>
                    <p className="text-gray-400">
                      Address
                    </p>

                    <p className="mt-1">
                      {selectedBranch.address}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-400">
                      Location
                    </p>

                    <p className="mt-1">
                      {selectedBranch.city},{' '}
                      {selectedBranch.state},{' '}
                      {selectedBranch.country}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-400">
                      Phone
                    </p>

                    <p className="mt-1">
                      {selectedBranch.phone}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-400">
                      Email
                    </p>

                    <p className="mt-1 break-all">
                      {selectedBranch.email}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-400">
                      Opening Hours
                    </p>

                    <p className="mt-1">
                      {selectedBranch.openingTime}
                      {' - '}
                      {selectedBranch.closingTime}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-400">
                      Weekly Holiday
                    </p>

                    <p className="mt-1">
                      {selectedBranch.weeklyHoliday ||
                        'Not set'}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-400">
                      Branch Manager
                    </p>

                    <p className="mt-1">
                      {selectedBranch.manager
                        ?.fullName ||
                        'Not assigned'}
                    </p>
                  </div>

                </div>
              </div>

              {/* EMPLOYEES */}

              <div>

                <div className="mb-3 flex items-center justify-between">

                  <h3 className="font-semibold">
                    Branch Employees
                  </h3>

                  <span className="text-sm text-gray-500">
                    {selectedBranch
                      .employees?.length || 0}{' '}
                    employees
                  </span>

                </div>

                {!selectedBranch.employees ||
                selectedBranch.employees.length ===
                  0 ? (
                  <div className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">
                    No employees assigned to this
                    branch.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">

                    <table className="w-full min-w-[700px] text-left text-sm">

                      <thead className="bg-gray-50">

                        <tr>
                          <th className="px-4 py-3">
                            Employee
                          </th>

                          <th className="px-4 py-3">
                            Login
                          </th>

                          <th className="px-4 py-3">
                            Role
                          </th>

                          <th className="px-4 py-3">
                            Department
                          </th>

                          <th className="px-4 py-3">
                            Status
                          </th>
                        </tr>

                      </thead>

                      <tbody className="divide-y">

                        {selectedBranch.employees.map(
                          (employee) => (
                            <tr key={employee.id}>

                              <td className="px-4 py-3">

                                <div className="font-medium">
                                  {employee.fullName}
                                </div>

                                <div className="text-xs text-gray-500">
                                  {employee.phone ||
                                    employee.email ||
                                    'No contact'}
                                </div>

                              </td>

                              <td className="px-4 py-3">
                                {employee.loginId ||
                                  '—'}
                              </td>

                              <td className="px-4 py-3">
                                {employee.role}
                              </td>

                              <td className="px-4 py-3">
                                {employee.department ||
                                  '—'}
                              </td>

                              <td className="px-4 py-3">

                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                    employee.status ===
                                    'ACTIVE'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {employee.status}
                                </span>

                              </td>

                            </tr>
                          ),
                        )}

                      </tbody>

                    </table>

                  </div>
                )}

              </div>

              {/* DATA COUNTS */}

              <div>

                <h3 className="mb-3 font-semibold">
                  Branch Data
                </h3>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-gray-500">
                      Employees
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {selectedBranch._count
                        ?.employees || 0}
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-gray-500">
                      Categories
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {selectedBranch._count
                        ?.categories || 0}
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-gray-500">
                      Menu Items
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {selectedBranch._count?.items ||
                        0}
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-gray-500">
                      Tables
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {selectedBranch._count?.tables ||
                        0}
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-gray-500">
                      Orders
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {selectedBranch._count?.orders ||
                        0}
                    </p>
                  </div>

                </div>
              </div>

              {/* FOOTER */}

              <div className="flex justify-end border-t pt-4">

                <button
                  type="button"
                  onClick={() =>
                    setSelectedBranch(null)
                  }
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Close
                </button>

              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}