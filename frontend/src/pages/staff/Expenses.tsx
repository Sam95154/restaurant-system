import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, API_BASE_URL } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type PaymentMethod =
  | 'CASH'
  | 'UPI'
  | 'CARD'
  | 'OTHER';

type ExpenseStatus =
  | 'ACTIVE'
  | 'CANCELLED';

interface Branch {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  branchId: string;
  createdById: string;
  category: string;
  amount: number | string;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  description?: string | null;
  receiptUrl?: string | null;
  status: ExpenseStatus;
  createdAt: string;
  updatedAt: string;
  branch?: {
    id: string;
    name: string;
  };
  createdBy?: {
    id: string;
    fullName: string;
    role: string;
  };
}

interface BranchResponse {
  branches?: Branch[];
  data?: Branch[];
}

interface ExpenseResponse {
  expenses: Expense[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    activeExpenseCount: number;
    activeExpenseTotal: number | string;
  };
}

interface ExpenseForm {
  branchId: string;
  category: string;
  amount: string;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  description: string;
  receiptUrl: string;
}

const paymentMethods: PaymentMethod[] = [
  'CASH',
  'UPI',
  'CARD',
  'OTHER',
];

const emptyForm: ExpenseForm = {
  branchId: '',
  category: '',
  amount: '',
  expenseDate: new Date().toISOString().slice(0, 10),
  paymentMethod: 'CASH',
  description: '',
  receiptUrl: '',
};

const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;

const ALLOWED_RECEIPT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function money(value: number | string) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string) {
  if (!value) return '-';

  return new Date(value).toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  );
}

function getReceiptUrl(receiptUrl?: string | null) {
  if (!receiptUrl) return '';

  if (
    receiptUrl.startsWith('http://') ||
    receiptUrl.startsWith('https://')
  ) {
    return receiptUrl;
  }

  const baseUrl = API_BASE_URL.replace(
    /\/api\/?$/,
    '',
  );

  return `${baseUrl}${receiptUrl.startsWith('/') ? '' : '/'}${receiptUrl}`;
}

export default function Expenses() {
  const { employee } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingReceiptId, setUploadingReceiptId] =
    useState<string | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] =
    useState<Expense | null>(null);

  const [form, setForm] = useState(emptyForm);

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPaymentMethod, setFilterPaymentMethod] =
    useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [page, setPage] = useState(1);

  const [pagination, setPagination] =
    useState<ExpenseResponse['pagination']>({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 1,
    });

  const [summary, setSummary] =
    useState<ExpenseResponse['summary']>({
      activeExpenseCount: 0,
      activeExpenseTotal: 0,
    });

  const receiptInputRefs =
    useRef<Record<string, HTMLInputElement | null>>({});

  const isSuperAdmin =
    employee?.role === 'SUPER_ADMIN';

  const categories = useMemo(() => {
    return Array.from(
      new Set(
        expenses
          .map((expense) => expense.category)
          .filter(Boolean),
      ),
    ).sort();
  }, [expenses]);

  function resetMessages() {
    setError('');
    setSuccess('');
  }

  function resetForm() {
    setForm({
      ...emptyForm,
      branchId: isSuperAdmin
        ? branches[0]?.id ?? ''
        : employee?.branchId ?? '',
    });

    setEditingExpense(null);
  }

  async function loadBranches() {
    try {
      const response = await api.get<
        BranchResponse | Branch[]
      >('/branches');

      const data = Array.isArray(response.data)
        ? response.data
        : response.data.branches ??
          response.data.data ??
          [];

      setBranches(data);

      if (!form.branchId) {
        setForm((previous) => ({
          ...previous,
          branchId: isSuperAdmin
            ? data[0]?.id ?? ''
            : employee?.branchId ?? '',
        }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadExpenses() {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();

      params.set('page', String(page));
      params.set('limit', '10');

      if (filterCategory) {
        params.set(
          'category',
          filterCategory,
        );
      }

      if (filterPaymentMethod) {
        params.set(
          'paymentMethod',
          filterPaymentMethod,
        );
      }

      if (filterStatus) {
        params.set(
          'status',
          filterStatus,
        );
      }

      if (fromDate) {
        params.set('fromDate', fromDate);
      }

      if (toDate) {
        params.set('toDate', toDate);
      }

      const response =
        await api.get<ExpenseResponse>(
          `/expenses?${params.toString()}`,
        );

      setExpenses(response.data.expenses ?? []);

      setPagination(
        response.data.pagination ?? {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 1,
        },
      );

      setSummary(
        response.data.summary ?? {
          activeExpenseCount: 0,
          activeExpenseTotal: 0,
        },
      );
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to load expenses.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [
    page,
    filterCategory,
    filterPaymentMethod,
    filterStatus,
    fromDate,
    toDate,
  ]);

  function openCreateForm() {
    resetMessages();

    setEditingExpense(null);

    setForm({
      ...emptyForm,
      branchId: isSuperAdmin
        ? branches[0]?.id ?? ''
        : employee?.branchId ?? '',
    });

    setShowForm(true);
  }

  function openEditForm(
    expense: Expense,
  ) {
    resetMessages();

    setEditingExpense(expense);

    setForm({
      branchId: expense.branchId,
      category: expense.category,
      amount: String(expense.amount),
      expenseDate: expense.expenseDate
        ? new Date(expense.expenseDate)
            .toISOString()
            .slice(0, 10)
        : '',
      paymentMethod:
        expense.paymentMethod,
      description:
        expense.description ?? '',
      receiptUrl:
        expense.receiptUrl ?? '',
    });

    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    resetForm();
  }

  async function saveExpense(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    resetMessages();

    if (!form.branchId) {
      setError('Please select a branch.');
      return;
    }

    if (!form.category.trim()) {
      setError(
        'Please enter an expense category.',
      );
      return;
    }

    const amount = Number(form.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setError(
        'Expense amount must be greater than zero.',
      );
      return;
    }

    if (!form.expenseDate) {
      setError(
        'Please select an expense date.',
      );
      return;
    }

    setSaving(true);

    try {
      const payload = {
        branchId: form.branchId,
        category: form.category.trim(),
        amount,
        expenseDate: form.expenseDate,
        paymentMethod: form.paymentMethod,
        description:
          form.description.trim() || null,
      };

      if (editingExpense) {
        await api.patch(
          `/expenses/${editingExpense.id}`,
          payload,
        );

        setSuccess(
          'Expense updated successfully.',
        );
      } else {
        await api.post(
          '/expenses',
          payload,
        );

        setSuccess(
          'Expense created successfully.',
        );
      }

      setShowForm(false);
      resetForm();

      await loadExpenses();
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to save the expense.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadReceipt(
    expense: Expense,
    file: File,
  ) {
    resetMessages();

    if (expense.status === 'CANCELLED') {
      setError(
        'Cancelled expenses cannot receive a receipt.',
      );
      return;
    }

    if (
      !ALLOWED_RECEIPT_TYPES.has(
        file.type,
      )
    ) {
      setError(
        'Only PDF, JPG, JPEG, PNG, and WEBP files are allowed.',
      );
      return;
    }

    if (file.size > MAX_RECEIPT_SIZE) {
      setError(
        'Receipt file must be 10 MB or smaller.',
      );
      return;
    }

    setUploadingReceiptId(expense.id);

    try {
      const formData = new FormData();

      formData.append(
        'receipt',
        file,
      );

      const response =
        await api.post<{
          message: string;
          expense: Expense;
        }>(
          `/expenses/${expense.id}/receipt`,
          formData,
        );

      setSuccess(
        response.data.message ||
          'Receipt uploaded successfully.',
      );

      await loadExpenses();
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to upload receipt.',
      );
    } finally {
      setUploadingReceiptId(null);

      const input =
        receiptInputRefs.current[
          expense.id
        ];

      if (input) {
        input.value = '';
      }
    }
  }

  function chooseReceipt(
    expense: Expense,
  ) {
    if (expense.status === 'CANCELLED') {
      return;
    }

    receiptInputRefs.current[
      expense.id
    ]?.click();
  }

  function handleReceiptSelected(
    expense: Expense,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    void uploadReceipt(
      expense,
      file,
    );
  }

  async function cancelExpense(
    expense: Expense,
  ) {
    const confirmed =
      window.confirm(
        `Cancel this expense of ${money(
          expense.amount,
        )}?`,
      );

    if (!confirmed) return;

    resetMessages();

    try {
      await api.post(
        `/expenses/${expense.id}/cancel`,
      );

      setSuccess(
        'Expense cancelled successfully.',
      );

      await loadExpenses();
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to cancel the expense.',
      );
    }
  }

  function clearFilters() {
    setSearch('');
    setFilterCategory('');
    setFilterPaymentMethod('');
    setFilterStatus('');
    setFromDate('');
    setToDate('');
    setPage(1);
  }

  const filteredExpenses =
    expenses.filter((expense) => {
      if (!search.trim()) return true;

      const query =
        search.trim().toLowerCase();

      return (
        expense.category
          .toLowerCase()
          .includes(query) ||
        expense.description
          ?.toLowerCase()
          .includes(query) ||
        expense.createdBy?.fullName
          ?.toLowerCase()
          .includes(query)
      );
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-coffee-dark">
            Expenses
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Record and manage restaurant expenses.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-xl bg-coffee-dark px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
        >
          + Add Expense
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Active Expenses
          </div>

          <div className="mt-2 text-2xl font-bold text-coffee-dark">
            {summary.activeExpenseCount}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Active Expense Total
          </div>

          <div className="mt-2 text-2xl font-bold text-coffee-dark">
            {money(
              summary.activeExpenseTotal,
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Total Records
          </div>

          <div className="mt-2 text-2xl font-bold text-coffee-dark">
            {pagination.total}
          </div>

          <div className="mt-1 text-xs text-gray-400">
            total expense records
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-coffee-dark">
              Expense History
            </h2>

            <p className="text-xs text-gray-400">
              Search and filter recorded expenses.
            </p>
          </div>

          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search..."
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
          />

          <select
            value={filterCategory}
            onChange={(event) => {
              setFilterCategory(
                event.target.value,
              );
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
          >
            <option value="">
              All Categories
            </option>

            {categories.map(
              (category) => (
                <option
                  key={category}
                  value={category}
                >
                  {category}
                </option>
              ),
            )}
          </select>

          <select
            value={filterPaymentMethod}
            onChange={(event) => {
              setFilterPaymentMethod(
                event.target.value,
              );
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
          >
            <option value="">
              All Payment Methods
            </option>

            {paymentMethods.map(
              (method) => (
                <option
                  key={method}
                  value={method}
                >
                  {method}
                </option>
              ),
            )}
          </select>

          <select
            value={filterStatus}
            onChange={(event) => {
              setFilterStatus(
                event.target.value,
              );
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
          >
            <option value="">
              All Statuses
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="CANCELLED">
              Cancelled
            </option>
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(
                event.target.value,
              );
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
          />

          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(
                event.target.value,
              );
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-5 py-4 font-semibold text-gray-600">
                  Date
                </th>

                <th className="px-5 py-4 font-semibold text-gray-600">
                  Category
                </th>

                <th className="px-5 py-4 font-semibold text-gray-600">
                  Amount
                </th>

                <th className="px-5 py-4 font-semibold text-gray-600">
                  Payment
                </th>

                <th className="px-5 py-4 font-semibold text-gray-600">
                  Description
                </th>

                <th className="px-5 py-4 font-semibold text-gray-600">
                  Receipt
                </th>

                <th className="px-5 py-4 font-semibold text-gray-600">
                  Status
                </th>

                <th className="px-5 py-4 text-right font-semibold text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-gray-400"
                  >
                    Loading expenses...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-gray-400"
                  >
                    No expenses found.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(
                  (expense) => (
                    <tr
                      key={expense.id}
                      className="hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-gray-600">
                        {formatDate(
                          expense.expenseDate,
                        )}
                      </td>

                      <td className="px-5 py-4 font-semibold text-coffee-dark">
                        {expense.category}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-coffee-dark">
                        {money(
                          expense.amount,
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                          {expense.paymentMethod}
                        </span>
                      </td>

                      <td className="max-w-xs px-5 py-4 text-gray-500">
                        <div className="truncate">
                          {expense.description ||
                            '-'}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <input
                          ref={(element) => {
                            receiptInputRefs.current[
                              expense.id
                            ] = element;
                          }}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={
                            expense.status ===
                              'CANCELLED' ||
                            uploadingReceiptId ===
                              expense.id
                          }
                          onChange={(event) =>
                            handleReceiptSelected(
                              expense,
                              event,
                            )
                          }
                        />

                        <div className="flex items-center gap-2">
                          {expense.receiptUrl ? (
                            <a
                              href={getReceiptUrl(
                                expense.receiptUrl,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                            >
                              View
                            </a>
                          ) : null}

                          {expense.status ===
                          'ACTIVE' ? (
                            <button
                              type="button"
                              disabled={
                                uploadingReceiptId ===
                                expense.id
                              }
                              onClick={() =>
                                chooseReceipt(
                                  expense,
                                )
                              }
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {uploadingReceiptId ===
                              expense.id
                                ? 'Uploading...'
                                : expense.receiptUrl
                                ? 'Replace'
                                : 'Upload'}
                            </button>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            'rounded-lg px-2.5 py-1 text-xs font-semibold',
                            expense.status ===
                            'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700',
                          ].join(' ')}
                        >
                          {expense.status}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {expense.status ===
                            'ACTIVE' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  openEditForm(
                                    expense,
                                  )
                                }
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  cancelExpense(
                                    expense,
                                  )
                                }
                                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-400">
            Page {pagination.page} of{' '}
            {Math.max(
              pagination.totalPages,
              1,
            )}{' '}
            · {pagination.total} records
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                setPage((value) =>
                  Math.max(
                    value - 1,
                    1,
                  ),
                )
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <button
              type="button"
              disabled={
                page >=
                pagination.totalPages
              }
              onClick={() =>
                setPage((value) =>
                  Math.min(
                    value + 1,
                    pagination.totalPages,
                  ),
                )
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="font-serif text-2xl font-bold text-coffee-dark">
                  {editingExpense
                    ? 'Edit Expense'
                    : 'Add Expense'}
                </h2>

                <p className="mt-1 text-xs text-gray-400">
                  Enter the actual expense details.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={saveExpense}
              className="space-y-5 p-6"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Branch */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Branch
                  </label>

                  <select
                    value={form.branchId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        branchId:
                          event.target.value,
                      })
                    }
                    disabled={
                      !isSuperAdmin ||
                      !!editingExpense
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark disabled:bg-gray-100"
                  >
                    <option value="">
                      Select Branch
                    </option>

                    {branches.map(
                      (branch) => (
                        <option
                          key={branch.id}
                          value={branch.id}
                        >
                          {branch.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Category
                  </label>

                  <input
                    value={form.category}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        category:
                          event.target.value,
                      })
                    }
                    placeholder="Electricity"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Amount (₹)
                  </label>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        amount:
                          event.target.value,
                      })
                    }
                    placeholder="0.00"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Expense Date
                  </label>

                  <input
                    type="date"
                    value={form.expenseDate}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        expenseDate:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
                  />
                </div>

                {/* Payment */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Payment Method
                  </label>

                  <select
                    value={
                      form.paymentMethod
                    }
                    onChange={(event) =>
                      setForm({
                        ...form,
                        paymentMethod:
                          event.target
                            .value as PaymentMethod,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
                  >
                    {paymentMethods.map(
                      (method) => (
                        <option
                          key={method}
                          value={method}
                        >
                          {method}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                {/* Receipt */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Receipt
                  </label>

                  {editingExpense?.receiptUrl ? (
                    <div className="mb-2 flex items-center gap-2">
                      <a
                        href={getReceiptUrl(
                          editingExpense.receiptUrl,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-green-700 underline"
                      >
                        View current receipt
                      </a>
                    </div>
                  ) : null}

                  <p className="text-xs text-gray-500">
                    Upload receipts from the
                    expense table using Upload or
                    Replace.
                  </p>

                  <p className="mt-1 text-[11px] text-gray-400">
                    PDF, JPG, JPEG, PNG, WEBP ·
                    maximum 10 MB
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Description
                </label>

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description:
                        event.target.value,
                    })
                  }
                  rows={4}
                  maxLength={1000}
                  placeholder="Enter expense details..."
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-coffee-dark"
                />

                <div className="mt-1 text-right text-[11px] text-gray-400">
                  {form.description.length}/1000
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-coffee-dark px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingExpense
                    ? 'Update Expense'
                    : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
