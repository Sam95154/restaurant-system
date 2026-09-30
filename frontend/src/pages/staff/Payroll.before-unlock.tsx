import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type PayrollStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'LOCKED';

interface Employee {
  id: string;
  fullName: string;
  loginId: string;
  role: string;
  department?: string | null;
  branchId?: string | null;
  branch?: {
    id: string;
    name: string;
  } | null;
}

interface Branch {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
}

interface PayrollRecord {
  id: string;
  employeeId: string;
  branchId: string;
  payrollMonth: string;

  basicSalary: string | number;
  allowances: string | number;
  overtimeAmount: string | number;
  grossSalary: string | number;

  absenceDeduction: string | number;
  otherDeductions: string | number;
  totalDeductions: string | number;

  netSalary: string | number;

  workingDays: number;
  presentDays: string | number;
  absentDays: string | number;
  leaveDays: string | number;
  halfDays: string | number;
  overtimeHours: string | number;

  payrollMode?: 'MANUAL';
  status: PayrollStatus;

  calculatedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  lockedAt?: string | null;

  createdAt?: string;
  updatedAt?: string;

  employee?: {
    id: string;
    fullName: string;
    loginId?: string;
    role?: string;
    department?: string | null;
  };

  branch?: {
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
  };
}

interface Pagination {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Something went wrong.'
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong.';
}

function money(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return '₹0.00';
  }

  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function currentMonth(): string {
  const date = new Date();

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}`;
}

function monthToDate(month: string): string {
  return `${month}-01`;
}

function formatMonth(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function statusLabel(status: PayrollStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'CALCULATED':
      return 'Calculated';
    case 'REVIEWED':
      return 'Reviewed';
    case 'APPROVED':
      return 'Approved';
    case 'LOCKED':
      return 'Locked';
    default:
      return status;
  }
}

function statusClass(status: PayrollStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'status draft';
    case 'CALCULATED':
      return 'status calculated';
    case 'REVIEWED':
      return 'status reviewed';
    case 'APPROVED':
      return 'status approved';
    case 'LOCKED':
      return 'status locked';
    default:
      return 'status';
  }
}

export default function Payroll() {
  const { employee: currentEmployee } = useAuth();

  const isSuperAdmin =
    currentEmployee?.role === 'SUPER_ADMIN';

  const isManager =
    currentEmployee?.role === 'MANAGER';

  const canManagePayroll =
    isSuperAdmin || isManager;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);

  const [selectedBranchId, setSelectedBranchId] =
    useState(
      currentEmployee?.branchId ||
        localStorage.getItem('selected_branch_id') ||
        '',
    );

  const [selectedMonth, setSelectedMonth] =
    useState(currentMonth());

  const [selectedEmployeeId, setSelectedEmployeeId] =
    useState('');

  const [grossSalary, setGrossSalary] =
    useState('');

  const [totalDeductions, setTotalDeductions] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState<PayrollStatus | 'ALL'>('ALL');

  const [search, setSearch] = useState('');

  const [editingRecord, setEditingRecord] =
    useState<PayrollRecord | null>(null);

  const [showForm, setShowForm] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [actionLoading, setActionLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const [pagination, setPagination] =
    useState<Pagination>({
      page: 1,
      limit: 20,
      totalRecords: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });

  const branchId = isSuperAdmin
    ? selectedBranchId
    : currentEmployee?.branchId || '';

  const netSalary = useMemo(() => {
    const gross = Number(grossSalary || 0);
    const deductions = Number(totalDeductions || 0);

    return gross - deductions;
  }, [grossSalary, totalDeductions]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return records;
    }

    return records.filter((record) => {
      const employeeName =
        record.employee?.fullName?.toLowerCase() || '';

      const loginId =
        record.employee?.loginId?.toLowerCase() || '';

      const department =
        record.employee?.department?.toLowerCase() || '';

      return (
        employeeName.includes(query) ||
        loginId.includes(query) ||
        department.includes(query)
      );
    });
  }, [records, search]);

  const statistics = useMemo(() => {
    const gross = records.reduce(
      (total, record) =>
        total + Number(record.grossSalary || 0),
      0,
    );

    const deductions = records.reduce(
      (total, record) =>
        total + Number(record.totalDeductions || 0),
      0,
    );

    const net = records.reduce(
      (total, record) =>
        total + Number(record.netSalary || 0),
      0,
    );

    return {
      total: records.length,
      draft: records.filter(
        (record) => record.status === 'DRAFT',
      ).length,
      approved: records.filter(
        (record) => record.status === 'APPROVED',
      ).length,
      locked: records.filter(
        (record) => record.status === 'LOCKED',
      ).length,
      gross,
      deductions,
      net,
    };
  }, [records]);

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function resetForm() {
    setSelectedEmployeeId('');
    setGrossSalary('');
    setTotalDeductions('');
    setEditingRecord(null);
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
    clearMessages();
  }

  async function loadBranches() {
    if (!isSuperAdmin) {
      return;
    }

    try {
      const response = await api.get('/branches');

      const data =
        response.data?.branches ??
        response.data ??
        [];

      setBranches(
        Array.isArray(data) ? data : [],
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function loadEmployees() {
    if (!branchId) {
      setEmployees([]);
      return;
    }

    try {
      const response = await api.get(
        '/payroll/employees',
        {
          params: {
            branchId,
          },
        },
      );

      const data =
        response.data?.employees ??
        response.data ??
        [];

      setEmployees(
        Array.isArray(data) ? data : [],
      );
    } catch (err) {
      setEmployees([]);
      setError(getErrorMessage(err));
    }
  }

  async function loadRecords(page = 1) {
    if (!branchId) {
      setRecords([]);

      setPagination({
        page: 1,
        limit: 20,
        totalRecords: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      return;
    }

    try {
      setLoading(true);

      const params: Record<
        string,
        string | number
      > = {
        branchId,
        payrollMonth: monthToDate(
          selectedMonth,
        ),
        page,
        limit: 20,
      };

      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }

      const response = await api.get(
        '/payroll/records',
        {
          params,
        },
      );

      const data = response.data;

      setRecords(
        Array.isArray(data?.payrollRecords)
          ? data.payrollRecords
          : [],
      );

      if (data?.pagination) {
        setPagination(data.pagination);
      }
    } catch (err) {
      setRecords([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canManagePayroll) {
      return;
    }

    loadBranches();
  }, [canManagePayroll, isSuperAdmin]);

  useEffect(() => {
    if (!canManagePayroll) {
      return;
    }

    loadEmployees();
  }, [branchId, canManagePayroll]);

  useEffect(() => {
    if (!canManagePayroll) {
      return;
    }

    loadRecords(1);
  }, [
    branchId,
    selectedMonth,
    statusFilter,
    canManagePayroll,
  ]);

  useEffect(() => {
    const handleBranchChange = (event: Event) => {
      const customEvent =
        event as CustomEvent<{
          branchId?: string;
        }>;

      const newBranchId =
        customEvent.detail?.branchId || '';

      if (isSuperAdmin) {
        setSelectedBranchId(newBranchId);
      }
    };

    window.addEventListener(
      'branchChanged',
      handleBranchChange,
    );

    return () => {
      window.removeEventListener(
        'branchChanged',
        handleBranchChange,
      );
    };
  }, [isSuperAdmin]);

  function openNewPayroll() {
    clearMessages();
    resetForm();
    setShowForm(true);
  }

  function editPayroll(record: PayrollRecord) {
    clearMessages();

    if (record.status === 'LOCKED') {
      setError(
        'Locked payroll cannot be edited.',
      );
      return;
    }

    setEditingRecord(record);

    setSelectedEmployeeId(
      record.employeeId,
    );

    setGrossSalary(
      String(record.grossSalary ?? ''),
    );

    setTotalDeductions(
      String(
        record.totalDeductions ?? '',
      ),
    );

    const date = new Date(
      record.payrollMonth,
    );

    if (!Number.isNaN(date.getTime())) {
      setSelectedMonth(
        `${date.getUTCFullYear()}-${String(
          date.getUTCMonth() + 1,
        ).padStart(2, '0')}`,
      );
    }

    setShowForm(true);
  }

  async function savePayroll(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    clearMessages();

    if (!branchId) {
      setError(
        'Please select a branch.',
      );
      return;
    }

    if (!selectedEmployeeId) {
      setError(
        'Please select an employee.',
      );
      return;
    }

    const gross = Number(grossSalary);
    const deductions =
      Number(totalDeductions);

    if (!Number.isFinite(gross) || gross < 0) {
      setError(
        'Enter a valid gross salary.',
      );
      return;
    }

    if (
      !Number.isFinite(deductions) ||
      deductions < 0
    ) {
      setError(
        'Enter valid deductions.',
      );
      return;
    }

    if (deductions > gross) {
      setError(
        'Deductions cannot be greater than gross salary.',
      );
      return;
    }

    const calculatedNet =
      gross - deductions;

    try {
      setSaving(true);

      const response = await api.post(
        '/payroll/manual',
        {
          employeeId:
            selectedEmployeeId,
          branchId,
          payrollMonth:
            monthToDate(selectedMonth),
          grossSalary: gross,
          totalDeductions: deductions,
          netSalary: calculatedNet,
        },
      );

      setSuccess(
        response.data?.message ||
          'Manual payroll saved successfully.',
      );

      setShowForm(false);
      resetForm();

      await loadRecords(1);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function workflowAction(
    record: PayrollRecord,
    action:
      | 'review'
      | 'approve'
      | 'lock',
  ) {
    clearMessages();

    let message = '';

    if (action === 'review') {
      message =
        `Review payroll for ${record.employee?.fullName || 'this employee'}?`;
    }

    if (action === 'approve') {
      message =
        `Approve payroll for ${record.employee?.fullName || 'this employee'}?`;
    }

    if (action === 'lock') {
      message =
        `Lock payroll for ${record.employee?.fullName || 'this employee'}?\n\nLocked payroll cannot be edited.`;
    }

    if (!window.confirm(message)) {
      return;
    }

    try {
      setActionLoading(true);

      const response = await api.post(
        `/payroll/${record.id}/${action}`,
      );

      setSuccess(
        response.data?.message ||
          `Payroll ${action}d successfully.`,
      );

      await loadRecords(
        pagination.page,
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  function actionForStatus(
    status: PayrollStatus,
  ) {
    if (status === 'DRAFT') {
      return 'review' as const;
    }

    if (status === 'REVIEWED') {
      return 'approve' as const;
    }

    if (status === 'APPROVED') {
      return 'lock' as const;
    }

    return null;
  }

  if (!currentEmployee) {
    return null;
  }

  if (!canManagePayroll) {
    return (
      <div className="payroll-page">
        <style>{`
          .payroll-page {
            padding: 24px;
          }

          .payroll-access-card {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 40px;
            text-align: center;
          }

          .payroll-access-card h1 {
            margin: 0 0 10px;
          }

          .payroll-access-card p {
            color: #64748b;
          }
        `}</style>

        <div className="payroll-access-card">
          <h1>Payroll</h1>
          <p>
            Payroll management is available
            to Super Admin and Manager accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="payroll-page">
      <style>{`
        .payroll-page {
          padding: 24px;
          max-width: 1600px;
          margin: 0 auto;
          color: #0f172a;
        }

        .payroll-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 24px;
        }

        .payroll-title h1 {
          margin: 0 0 6px;
          font-size: 30px;
          font-weight: 700;
        }

        .payroll-title p {
          margin: 0;
          color: #64748b;
        }

        .payroll-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .payroll-btn {
          border: 0;
          border-radius: 8px;
          padding: 10px 16px;
          cursor: pointer;
          font-weight: 600;
        }

        .payroll-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .payroll-btn.primary {
          background: #2563eb;
          color: white;
        }

        .payroll-btn.primary:hover {
          background: #1d4ed8;
        }

        .payroll-btn.secondary {
          background: #e2e8f0;
          color: #0f172a;
        }

        .payroll-btn.success {
          background: #16a34a;
          color: white;
        }

        .payroll-btn.warning {
          background: #d97706;
          color: white;
        }

        .payroll-btn.dark {
          background: #334155;
          color: white;
        }

        .payroll-message {
          padding: 13px 16px;
          border-radius: 10px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .payroll-error {
          background: #fee2e2;
          border: 1px solid #fecaca;
          color: #991b1b;
        }

        .payroll-success {
          background: #dcfce7;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .payroll-branch-toolbar {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 18px;
        }

        .payroll-input,
        .payroll-select {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 12px;
          background: white;
          color: #0f172a;
          outline: none;
        }

        .payroll-input:focus,
        .payroll-select:focus {
          border-color: #2563eb;
        }

        .payroll-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 18px;
        }

        .payroll-stat,
        .payroll-money-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
        }

        .payroll-stat-label,
        .payroll-money-label {
          color: #64748b;
          font-size: 13px;
          margin-bottom: 7px;
        }

        .payroll-stat-value {
          font-size: 25px;
          font-weight: 700;
        }

        .payroll-money-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-bottom: 22px;
        }

        .payroll-money-value {
          font-size: 22px;
          font-weight: 700;
        }

        .payroll-toolbar {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 18px;
        }

        .payroll-search {
          min-width: 250px;
          flex: 1;
        }

        .payroll-table-wrap {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow-x: auto;
        }

        .payroll-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1200px;
        }

        .payroll-table th,
        .payroll-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          white-space: nowrap;
        }

        .payroll-table th {
          background: #f8fafc;
          color: #64748b;
          font-size: 12px;
          text-transform: uppercase;
        }

        .payroll-table tbody tr:hover {
          background: #f8fafc;
        }

        .employee-name {
          font-weight: 600;
        }

        .employee-meta {
          margin-top: 3px;
          color: #64748b;
          font-size: 12px;
        }

        .status {
          display: inline-flex;
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }

        .status.draft {
          background: #fef3c7;
          color: #92400e;
        }

        .status.calculated {
          background: #dbeafe;
          color: #1e40af;
        }

        .status.reviewed {
          background: #ede9fe;
          color: #6b21a8;
        }

        .status.approved {
          background: #dcfce7;
          color: #166534;
        }

        .status.locked {
          background: #e2e8f0;
          color: #334155;
        }

        .payroll-row-actions {
          display: flex;
          gap: 6px;
        }

        .payroll-small-btn {
          border: 0;
          border-radius: 6px;
          padding: 7px 10px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }

        .payroll-small-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .payroll-small-btn.edit {
          background: #dbeafe;
          color: #1e40af;
        }

        .payroll-small-btn.review {
          background: #fef3c7;
          color: #92400e;
        }

        .payroll-small-btn.approve {
          background: #dcfce7;
          color: #166534;
        }

        .payroll-small-btn.lock {
          background: #334155;
          color: white;
        }

        .payroll-empty {
          padding: 60px 20px;
          text-align: center;
          color: #64748b;
        }

        .payroll-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: white;
          border: 1px solid #e2e8f0;
          border-top: 0;
          border-radius: 0 0 12px 12px;
        }

        .payroll-pagination-info {
          color: #64748b;
          font-size: 13px;
        }

        .payroll-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(15, 23, 42, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .payroll-modal {
          width: 100%;
          max-width: 620px;
          max-height: 90vh;
          overflow-y: auto;
          background: white;
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.2);
        }

        .payroll-modal h2 {
          margin: 0 0 6px;
          font-size: 23px;
        }

        .payroll-modal-description {
          margin: 0 0 22px;
          color: #64748b;
          font-size: 14px;
        }

        .payroll-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .payroll-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .payroll-form-group.full {
          grid-column: 1 / -1;
        }

        .payroll-form-group label {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }

        .payroll-net-box {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 10px;
          padding: 16px;
        }

        .payroll-net-label {
          color: #166534;
          font-size: 13px;
          font-weight: 600;
        }

        .payroll-net-value {
          margin-top: 4px;
          color: #166534;
          font-size: 27px;
          font-weight: 800;
        }

        .payroll-modal-note {
          margin-top: 14px;
          padding: 12px;
          background: #f8fafc;
          border-radius: 8px;
          color: #64748b;
          font-size: 12px;
        }

        .payroll-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 22px;
        }

        @media (max-width: 1000px) {
          .payroll-stats {
            grid-template-columns: repeat(2, 1fr);
          }

          .payroll-money-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 700px) {
          .payroll-page {
            padding: 14px;
          }

          .payroll-header {
            flex-direction: column;
          }

          .payroll-form-grid {
            grid-template-columns: 1fr;
          }

          .payroll-form-group.full {
            grid-column: auto;
          }

          .payroll-stats {
            grid-template-columns: 1fr 1fr;
          }

          .payroll-search {
            min-width: 100%;
          }

          .payroll-pagination {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>

      <div className="payroll-header">
        <div className="payroll-title">
          <h1>Payroll</h1>
          <p>
            Manual monthly payroll management,
            review, approval and locking.
          </p>
        </div>

        <div className="payroll-actions">
          <button
            type="button"
            className="payroll-btn secondary"
            onClick={() => loadRecords(1)}
            disabled={loading}
          >
            ↻ Refresh
          </button>

          <button
            type="button"
            className="payroll-btn primary"
            onClick={openNewPayroll}
            disabled={!branchId}
          >
            + Manual Payroll
          </button>
        </div>
      </div>

      {error && (
        <div className="payroll-message payroll-error">
          {error}
        </div>
      )}

      {success && (
        <div className="payroll-message payroll-success">
          {success}
        </div>
      )}

      {isSuperAdmin && (
        <div className="payroll-branch-toolbar">
          <strong>Select Branch:</strong>

          <select
            className="payroll-select"
            value={selectedBranchId}
            onChange={(event) => {
              const value =
                event.target.value;

              setSelectedBranchId(value);

              localStorage.setItem(
                'selected_branch_id',
                value,
              );
            }}
          >
            <option value="">
              Select Branch
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

      {!branchId && (
        <div className="payroll-message payroll-error">
          Please select a branch before managing
          payroll.
        </div>
      )}

      <div className="payroll-stats">
        <div className="payroll-stat">
          <div className="payroll-stat-label">
            Records
          </div>

          <div className="payroll-stat-value">
            {statistics.total}
          </div>
        </div>

        <div className="payroll-stat">
          <div className="payroll-stat-label">
            Draft
          </div>

          <div className="payroll-stat-value">
            {statistics.draft}
          </div>
        </div>

        <div className="payroll-stat">
          <div className="payroll-stat-label">
            Approved
          </div>

          <div className="payroll-stat-value">
            {statistics.approved}
          </div>
        </div>

        <div className="payroll-stat">
          <div className="payroll-stat-label">
            Locked
          </div>

          <div className="payroll-stat-value">
            {statistics.locked}
          </div>
        </div>
      </div>

      <div className="payroll-money-grid">
        <div className="payroll-money-card">
          <div className="payroll-money-label">
            Total Gross
          </div>

          <div className="payroll-money-value">
            {money(statistics.gross)}
          </div>
        </div>

        <div className="payroll-money-card">
          <div className="payroll-money-label">
            Total Deductions
          </div>

          <div className="payroll-money-value">
            {money(statistics.deductions)}
          </div>
        </div>

        <div className="payroll-money-card">
          <div className="payroll-money-label">
            Total Net Salary
          </div>

          <div className="payroll-money-value">
            {money(statistics.net)}
          </div>
        </div>
      </div>

      <div className="payroll-toolbar">
        <input
          className="payroll-input payroll-search"
          placeholder="Search employee..."
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
        />

        <input
          className="payroll-input"
          type="month"
          value={selectedMonth}
          onChange={(event) =>
            setSelectedMonth(
              event.target.value,
            )
          }
        />

        <select
          className="payroll-select"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as
                | PayrollStatus
                | 'ALL',
            )
          }
        >
          <option value="ALL">
            All Statuses
          </option>
          <option value="DRAFT">
            Draft
          </option>
          <option value="CALCULATED">
            Calculated
          </option>
          <option value="REVIEWED">
            Reviewed
          </option>
          <option value="APPROVED">
            Approved
          </option>
          <option value="LOCKED">
            Locked
          </option>
        </select>
      </div>

      <div className="payroll-table-wrap">
        {loading ? (
          <div className="payroll-empty">
            Loading payroll records...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="payroll-empty">
            <div style={{ fontSize: 36 }}>
              💰
            </div>

            <div
              style={{
                marginTop: 10,
                fontWeight: 600,
              }}
            >
              No payroll records found
            </div>

            <div
              style={{
                marginTop: 5,
                fontSize: 13,
              }}
            >
              Create a manual payroll record
              for this month.
            </div>
          </div>
        ) : (
          <table className="payroll-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Branch</th>
                <th>Month</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net Salary</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredRecords.map(
                (record) => {
                  const action =
                    actionForStatus(
                      record.status,
                    );

                  return (
                    <tr key={record.id}>
                      <td>
                        <div className="employee-name">
                          {record.employee
                            ?.fullName ||
                            'Unknown Employee'}
                        </div>

                        <div className="employee-meta">
                          {record.employee
                            ?.department ||
                            record.employee
                              ?.role ||
                            ''}
                        </div>
                      </td>

                      <td>
                        {record.branch?.name ||
                          '-'}
                      </td>

                      <td>
                        {formatMonth(
                          record.payrollMonth,
                        )}
                      </td>

                      <td>
                        {money(
                          record.grossSalary,
                        )}
                      </td>

                      <td>
                        {money(
                          record.totalDeductions,
                        )}
                      </td>

                      <td>
                        <strong>
                          {money(
                            record.netSalary,
                          )}
                        </strong>
                      </td>

                      <td>
                        <strong>
                          {record.payrollMode ||
                            'MANUAL'}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={statusClass(
                            record.status,
                          )}
                        >
                          {statusLabel(
                            record.status,
                          )}
                        </span>
                      </td>

                      <td>
                        <div className="payroll-row-actions">
                          {record.status !==
                            'LOCKED' && (
                            <button
                              type="button"
                              className="payroll-small-btn edit"
                              onClick={() =>
                                editPayroll(
                                  record,
                                )
                              }
                            >
                              Edit
                            </button>
                          )}

                          {action ===
                            'review' && (
                            <button
                              type="button"
                              className="payroll-small-btn review"
                              onClick={() =>
                                workflowAction(
                                  record,
                                  'review',
                                )
                              }
                              disabled={
                                actionLoading
                              }
                            >
                              Review
                            </button>
                          )}

                          {action ===
                            'approve' && (
                            <button
                              type="button"
                              className="payroll-small-btn approve"
                              onClick={() =>
                                workflowAction(
                                  record,
                                  'approve',
                                )
                              }
                              disabled={
                                actionLoading
                              }
                            >
                              Approve
                            </button>
                          )}

                          {action ===
                            'lock' && (
                            <button
                              type="button"
                              className="payroll-small-btn lock"
                              onClick={() =>
                                workflowAction(
                                  record,
                                  'lock',
                                )
                              }
                              disabled={
                                actionLoading
                              }
                            >
                              Lock
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        )}
      </div>

      {pagination.totalPages > 0 && (
        <div className="payroll-pagination">
          <div className="payroll-pagination-info">
            Page {pagination.page} of{' '}
            {pagination.totalPages}
            {' • '}
            {pagination.totalRecords}{' '}
            records
          </div>

          <div className="payroll-actions">
            <button
              type="button"
              className="payroll-btn secondary"
              disabled={
                !pagination.hasPreviousPage ||
                loading
              }
              onClick={() =>
                loadRecords(
                  pagination.page - 1,
                )
              }
            >
              ← Previous
            </button>

            <button
              type="button"
              className="payroll-btn secondary"
              disabled={
                !pagination.hasNextPage ||
                loading
              }
              onClick={() =>
                loadRecords(
                  pagination.page + 1,
                )
              }
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="payroll-modal-overlay"
          onClick={closeForm}
        >
          <div
            className="payroll-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <h2>
              {editingRecord
                ? 'Edit Manual Payroll'
                : 'Create Manual Payroll'}
            </h2>

            <p className="payroll-modal-description">
              Enter Gross Salary and Deductions.
              Net Salary is calculated as:
              Gross Salary − Deductions.
            </p>

            <form onSubmit={savePayroll}>
              <div className="payroll-form-grid">
                <div className="payroll-form-group full">
                  <label>
                    Employee *
                  </label>

                  <select
                    className="payroll-select"
                    value={selectedEmployeeId}
                    onChange={(event) =>
                      setSelectedEmployeeId(
                        event.target.value,
                      )
                    }
                    disabled={
                      Boolean(editingRecord)
                    }
                    required
                  >
                    <option value="">
                      Select Employee
                    </option>

                    {employees.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.fullName}
                          {' — '}
                          {item.loginId}
                          {item.department
                            ? ` — ${item.department}`
                            : ''}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="payroll-form-group">
                  <label>
                    Payroll Month *
                  </label>

                  <input
                    className="payroll-input"
                    type="month"
                    value={selectedMonth}
                    onChange={(event) =>
                      setSelectedMonth(
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>

                <div className="payroll-form-group">
                  <label>
                    Gross Salary *
                  </label>

                  <input
                    className="payroll-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="20000"
                    value={grossSalary}
                    onChange={(event) =>
                      setGrossSalary(
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>

                <div className="payroll-form-group">
                  <label>
                    Total Deductions *
                  </label>

                  <input
                    className="payroll-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="1500"
                    value={totalDeductions}
                    onChange={(event) =>
                      setTotalDeductions(
                        event.target.value,
                      )
                    }
                    required
                  />
                </div>

                <div className="payroll-form-group">
                  <label>
                    Payroll Mode
                  </label>

                  <input
                    className="payroll-input"
                    value="MANUAL"
                    readOnly
                    disabled
                  />
                </div>

                <div className="payroll-form-group full">
                  <div className="payroll-net-box">
                    <div className="payroll-net-label">
                      Net Salary
                    </div>

                    <div className="payroll-net-value">
                      {money(
                        Math.max(
                          0,
                          netSalary,
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="payroll-modal-note">
                Attendance does not
                automatically calculate salary.
                This payroll system uses manual
                monthly salary entry as requested.
              </div>

              <div className="payroll-modal-actions">
                <button
                  type="button"
                  className="payroll-btn secondary"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="payroll-btn primary"
                  disabled={
                    saving ||
                    !branchId ||
                    !selectedEmployeeId
                  }
                >
                  {saving
                    ? 'Saving...'
                    : editingRecord
                      ? 'Update Payroll'
                      : 'Save Payroll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}