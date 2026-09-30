import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type Role =
  | 'SUPER_ADMIN'
  | 'MANAGER'
  | 'SERVICE_EMPLOYEE'
  | 'KITCHEN_EMPLOYEE'
  | 'BILLING_EMPLOYEE';

type Status = 'ACTIVE' | 'INACTIVE';

interface Branch {
  id: string;
  name: string;
  status?: string;
}

interface Employee {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  loginId: string;
  role: Role;
  department: string | null;
  status: Status;
  joiningDate: string;
  branchId: string | null;
  branch?: {
    id: string;
    name: string;
  } | null;
  managesBranch?: {
    id: string;
    name: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Manager',
  SERVICE_EMPLOYEE: 'Service Employee',
  KITCHEN_EMPLOYEE: 'Kitchen Employee',
  BILLING_EMPLOYEE: 'Billing Employee',
};

const ROLE_OPTIONS: Role[] = [
  'MANAGER',
  'SERVICE_EMPLOYEE',
  'KITCHEN_EMPLOYEE',
  'BILLING_EMPLOYEE',
];

const STATUS_OPTIONS: Status[] = ['ACTIVE', 'INACTIVE'];

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Something went wrong. Please try again.'
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function formatDate(value: string) {
  if (!value) return '-';

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getRoleBadge(role: Role) {
  const styles: Record<Role, string> = {
    SUPER_ADMIN: 'bg-purple-100 text-purple-700',
    MANAGER: 'bg-blue-100 text-blue-700',
    SERVICE_EMPLOYEE: 'bg-green-100 text-green-700',
    KITCHEN_EMPLOYEE: 'bg-orange-100 text-orange-700',
    BILLING_EMPLOYEE: 'bg-indigo-100 text-indigo-700',
  };

  return styles[role];
}

function getStatusBadge(status: Status) {
  return status === 'ACTIVE'
    ? 'bg-green-100 text-green-700'
    : 'bg-red-100 text-red-700';
}

export default function Employees() {
  const navigate = useNavigate();
  const { employee: currentEmployee } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  const [modal, setModal] = useState<
    'add' |
    'edit' |
    'details' |
    'role' |
    'branch' |
    'password' |
    'none'
  >('none');

  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);

  const [saving, setSaving] = useState(false);

  // Add/Edit form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('SERVICE_EMPLOYEE');
  const [department, setDepartment] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [joiningDate, setJoiningDate] = useState('');

  // Separate action forms
  const [newRole, setNewRole] = useState<Role>('SERVICE_EMPLOYEE');
  const [newBranchId, setNewBranchId] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const isSuperAdmin = currentEmployee?.role === 'SUPER_ADMIN';
  const isManager = currentEmployee?.role === 'MANAGER';

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function closeModal() {
    setModal('none');
    setSelectedEmployee(null);
    setSaving(false);
    clearMessages();
  }

  function resetEmployeeForm() {
    setFullName('');
    setEmail('');
    setPhone('');
    setLoginId('');
    setPassword('');
    setRole('SERVICE_EMPLOYEE');
    setDepartment('');
    setSelectedBranchId(
      isManager ? currentEmployee?.branchId ?? '' : '',
    );
    setJoiningDate('');
  }

  async function loadEmployees(showSpinner = true) {
    try {
      if (showSpinner) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      clearMessages();

      const response = await api.get('/employees');

      const data = response.data?.employees ?? response.data ?? [];

      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadBranches() {
    try {
      const response = await api.get('/branches');

      const data = response.data?.branches ?? response.data ?? [];

      setBranches(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    loadEmployees();
    loadBranches();
  }, []);

  const visibleBranches = useMemo(() => {
    if (isManager && currentEmployee?.branchId) {
      return branches.filter(
        (branch) => branch.id === currentEmployee.branchId,
      );
    }

    return branches;
  }, [branches, currentEmployee?.branchId, isManager]);

  const filteredEmployees = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return employees.filter((item) => {
      const matchesSearch =
        !searchValue ||
        item.fullName.toLowerCase().includes(searchValue) ||
        item.loginId.toLowerCase().includes(searchValue) ||
        (item.email ?? '').toLowerCase().includes(searchValue) ||
        (item.phone ?? '').toLowerCase().includes(searchValue) ||
        (item.department ?? '').toLowerCase().includes(searchValue);

      const matchesRole =
        !roleFilter || item.role === roleFilter;

      const matchesStatus =
        !statusFilter || item.status === statusFilter;

      const matchesBranch =
        !branchFilter || item.branchId === branchFilter;

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus &&
        matchesBranch
      );
    });
  }, [
    employees,
    search,
    roleFilter,
    statusFilter,
    branchFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: employees.length,
      active: employees.filter((item) => item.status === 'ACTIVE').length,
      inactive: employees.filter((item) => item.status === 'INACTIVE').length,
      managers: employees.filter((item) => item.role === 'MANAGER').length,
    };
  }, [employees]);

  function openAdd() {
    clearMessages();
    resetEmployeeForm();
    setSelectedEmployee(null);
    setModal('add');
  }

  function openEdit(item: Employee) {
    clearMessages();

    setSelectedEmployee(item);
    setFullName(item.fullName);
    setEmail(item.email ?? '');
    setPhone(item.phone ?? '');
    setDepartment(item.department ?? '');
    setJoiningDate(
      item.joiningDate
        ? new Date(item.joiningDate).toISOString().slice(0, 10)
        : '',
    );

    setModal('edit');
  }

  function openDetails(item: Employee) {
    clearMessages();
    navigate(`/staff/employees/${item.id}`);
  }

  function openRole(item: Employee) {
    clearMessages();
    setSelectedEmployee(item);
    setNewRole(item.role === 'SUPER_ADMIN' ? 'SERVICE_EMPLOYEE' : item.role);
    setModal('role');
  }

  function openBranch(item: Employee) {
    clearMessages();
    setSelectedEmployee(item);
    setNewBranchId(item.branchId ?? '');
    setModal('branch');
  }

  function openPassword(item: Employee) {
    clearMessages();
    setSelectedEmployee(item);
    setNewPassword('');
    setModal('password');
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault();
    clearMessages();

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }

    if (modal === 'add') {
      if (!loginId.trim()) {
        setError('Login ID is required.');
        return;
      }

      if (!password) {
        setError('Password is required.');
        return;
      }

      if (password.length < 6) {
        setError('Password must contain at least 6 characters.');
        return;
      }

      if (!selectedBranchId) {
        setError('Please select a branch.');
        return;
      }
    }

    try {
      setSaving(true);

      if (modal === 'add') {
        const response = await api.post('/employees', {
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          loginId: loginId.trim(),
          password,
          role,
          branchId: selectedBranchId,
          department: department.trim() || undefined,
          joiningDate: joiningDate || undefined,
        });

        setSuccess(
          response.data?.message ||
            'Employee created successfully.',
        );
      } else if (modal === 'edit' && selectedEmployee) {
        const response = await api.put(
          `/employees/${selectedEmployee.id}`,
          {
            fullName: fullName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            department: department.trim(),
            joiningDate: joiningDate || undefined,
          },
        );

        setSuccess(
          response.data?.message ||
            'Employee updated successfully.',
        );
      }

      setModal('none');
      setSelectedEmployee(null);

      await loadEmployees(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item: Employee) {
    clearMessages();

    const nextStatus: Status =
      item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const confirmed = window.confirm(
      nextStatus === 'INACTIVE'
        ? `Deactivate ${item.fullName}?`
        : `Activate ${item.fullName}?`,
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const response = await api.patch(
        `/employees/${item.id}/status`,
        {
          status: nextStatus,
        },
      );

      setSuccess(
        response.data?.message ||
          `Employee ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully.`,
      );

      await loadEmployees(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveRole(event: FormEvent) {
    event.preventDefault();

    if (!selectedEmployee) return;

    clearMessages();

    if (!isSuperAdmin) {
      setError('Only Super Admin can change employee roles.');
      return;
    }

    if (
      selectedEmployee.role === 'MANAGER' &&
      newRole !== 'MANAGER' &&
      selectedEmployee.managesBranch
    ) {
      setError(
        `Assign another manager to ${selectedEmployee.managesBranch.name} before changing this role.`,
      );
      return;
    }

    try {
      setSaving(true);

      const response = await api.patch(
        `/employees/${selectedEmployee.id}/role`,
        {
          role: newRole,
        },
      );

      setSuccess(
        response.data?.message ||
          'Employee role changed successfully.',
      );

      closeModal();
      await loadEmployees(false);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  async function saveBranch(event: FormEvent) {
    event.preventDefault();

    if (!selectedEmployee) return;

    clearMessages();

    if (!isSuperAdmin) {
      setError(
        'Only Super Admin can reassign employee branches.',
      );
      return;
    }

    if (!newBranchId) {
      setError('Please select a branch.');
      return;
    }

    try {
      setSaving(true);

      const response = await api.patch(
        `/employees/${selectedEmployee.id}/branch`,
        {
          branchId: newBranchId,
        },
      );

      setSuccess(
        response.data?.message ||
          'Employee branch assignment updated successfully.',
      );

      closeModal();
      await loadEmployees(false);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();

    if (!selectedEmployee) return;

    clearMessages();

    if (newPassword.length < 6) {
      setError(
        'New password must contain at least 6 characters.',
      );
      return;
    }

    try {
      setSaving(true);

      const response = await api.post(
        `/employees/${selectedEmployee.id}/reset-password`,
        {
          newPassword,
        },
      );

      setSuccess(
        response.data?.message ||
          'Employee password reset successfully.',
      );

      closeModal();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-cream p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-coffee/50">
              Staff Management
            </p>

            <h1 className="mt-1 font-serif text-3xl font-bold text-coffee-dark">
              Employees
            </h1>

            <p className="mt-1 text-sm text-coffee/60">
              Manage employee accounts, roles, branches and access.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => loadEmployees(false)}
              disabled={refreshing}
              className="rounded-xl border border-coffee/10 bg-white px-4 py-2.5 text-sm font-semibold text-coffee-dark shadow-sm hover:bg-coffee/5 disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : '↻ Refresh'}
            </button>

            <button
              type="button"
              onClick={openAdd}
              className="rounded-xl bg-turmeric px-4 py-2.5 text-sm font-bold text-coffee-dark shadow-sm hover:bg-turmeric-deep"
            >
              + Add Employee
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-coffee/10 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-coffee/50">
              Total Employees
            </p>
            <p className="mt-2 text-3xl font-bold text-coffee-dark">
              {stats.total}
            </p>
          </div>

          <div className="rounded-2xl border border-coffee/10 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-coffee/50">
              Active
            </p>
            <p className="mt-2 text-3xl font-bold text-green-600">
              {stats.active}
            </p>
          </div>

          <div className="rounded-2xl border border-coffee/10 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-coffee/50">
              Inactive
            </p>
            <p className="mt-2 text-3xl font-bold text-red-500">
              {stats.inactive}
            </p>
          </div>

          <div className="rounded-2xl border border-coffee/10 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-coffee/50">
              Managers
            </p>
            <p className="mt-2 text-3xl font-bold text-blue-600">
              {stats.managers}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 rounded-2xl border border-coffee/10 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee..."
              className="rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
            />

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
            >
              <option value="">All Roles</option>

              {ROLE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
            >
              <option value="">All Status</option>

              {STATUS_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            {isSuperAdmin && (
              <select
                value={branchFilter}
                onChange={(event) =>
                  setBranchFilter(event.target.value)
                }
                className="rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
              >
                <option value="">All Branches</option>

                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Employee table */}
        <div className="overflow-hidden rounded-2xl border border-coffee/10 bg-white shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-sm text-coffee/60">
              Loading employees...
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl">♟</div>

              <h3 className="mt-3 font-semibold text-coffee-dark">
                No employees found
              </h3>

              <p className="mt-1 text-sm text-coffee/50">
                Try changing your search or filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1050px] w-full">
                <thead>
                  <tr className="border-b border-coffee/10 bg-cream/70 text-left">
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-coffee/50">
                      Employee
                    </th>

                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-coffee/50">
                      Login ID
                    </th>

                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-coffee/50">
                      Role
                    </th>

                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-coffee/50">
                      Branch
                    </th>

                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-coffee/50">
                      Status
                    </th>

                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-coffee/50">
                      Joining Date
                    </th>

                    <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wider text-coffee/50">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredEmployees.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-coffee/5 last:border-0 hover:bg-cream/30"
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-coffee-dark">
                          {item.fullName}
                        </div>

                        <div className="mt-1 text-xs text-coffee/50">
                          {item.email || item.phone || 'No contact'}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm font-medium text-coffee/80">
                        {item.loginId}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${getRoleBadge(item.role)}`}
                        >
                          {ROLE_LABELS[item.role]}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm text-coffee/70">
                        {item.branch?.name || 'Unassigned'}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${getStatusBadge(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm text-coffee/70">
                        {formatDate(item.joiningDate)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openDetails(item)}
                            className="rounded-lg border border-coffee/10 px-3 py-1.5 text-xs font-semibold text-coffee-dark hover:bg-coffee/5"
                          >
                            View
                          </button>

                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="rounded-lg border border-coffee/10 px-3 py-1.5 text-xs font-semibold text-coffee-dark hover:bg-coffee/5"
                          >
                            Edit
                          </button>

                          {isSuperAdmin && item.role !== 'SUPER_ADMIN' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openRole(item)}
                                className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                Role
                              </button>

                              <button
                                type="button"
                                onClick={() => openBranch(item)}
                                className="rounded-lg border border-purple-200 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                              >
                                Branch
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => openPassword(item)}
                            className="rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                          >
                            Password
                          </button>

                          {item.id !== currentEmployee?.id && (
                            <button
                              type="button"
                              onClick={() => changeStatus(item)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                item.status === 'ACTIVE'
                                  ? 'border border-red-200 text-red-700 hover:bg-red-50'
                                  : 'border border-green-200 text-green-700 hover:bg-green-50'
                              }`}
                            >
                              {item.status === 'ACTIVE'
                                ? 'Deactivate'
                                : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit modal */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-coffee/10 px-6 py-5">
              <h2 className="font-serif text-2xl font-bold text-coffee-dark">
                {modal === 'add'
                  ? 'Add Employee'
                  : 'Edit Employee'}
              </h2>

              <p className="mt-1 text-sm text-coffee/50">
                {modal === 'add'
                  ? 'Create a new employee login and assign their branch.'
                  : 'Update employee profile information.'}
              </p>
            </div>

            <form onSubmit={saveEmployee} className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-coffee-dark">
                    Full Name *
                  </span>

                  <input
                    value={fullName}
                    onChange={(event) =>
                      setFullName(event.target.value)
                    }
                    className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-coffee-dark">
                    Department
                  </span>

                  <input
                    value={department}
                    onChange={(event) =>
                      setDepartment(event.target.value)
                    }
                    placeholder="e.g. Service"
                    className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-coffee-dark">
                    Email
                  </span>

                  <input
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-coffee-dark">
                    Phone
                  </span>

                  <input
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value)
                    }
                    className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
                  />
                </label>

                {modal === 'add' && (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-coffee-dark">
                        Login ID *
                      </span>

                      <input
                        value={loginId}
                        onChange={(event) =>
                          setLoginId(event.target.value)
                        }
                        placeholder="employee.login"
                        className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-coffee-dark">
                        Password *
                      </span>

                      <input
                        type="password"
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value)
                        }
                        placeholder="Minimum 6 characters"
                        className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-coffee-dark">
                        Role *
                      </span>

                      <select
                        value={role}
                        onChange={(event) =>
                          setRole(event.target.value as Role)
                        }
                        className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
                      >
                        {ROLE_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {ROLE_LABELS[item]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-coffee-dark">
                        Branch *
                      </span>

                      <select
                        value={selectedBranchId}
                        onChange={(event) =>
                          setSelectedBranchId(event.target.value)
                        }
                        disabled={isManager}
                        className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric disabled:opacity-60"
                        required
                      >
                        <option value="">Select branch</option>

                        {visibleBranches.map((branch) => (
                          <option
                            key={branch.id}
                            value={branch.id}
                          >
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-coffee-dark">
                    Joining Date
                  </span>

                  <input
                    type="date"
                    value={joiningDate}
                    onChange={(event) =>
                      setJoiningDate(event.target.value)
                    }
                    className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm outline-none focus:border-turmeric"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 border-t border-coffee/10 pt-5">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-coffee/10 px-5 py-2.5 text-sm font-semibold text-coffee-dark hover:bg-coffee/5"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-turmeric px-5 py-2.5 text-sm font-bold text-coffee-dark hover:bg-turmeric-deep disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : modal === 'add'
                      ? 'Create Employee'
                      : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details modal */}
      {modal === 'details' && selectedEmployee && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-coffee/10 px-6 py-5">
              <h2 className="font-serif text-2xl font-bold text-coffee-dark">
                Employee Details
              </h2>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-coffee/40">
                  Full Name
                </p>
                <p className="mt-1 font-semibold text-coffee-dark">
                  {selectedEmployee.fullName}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-coffee/40">
                  Login ID
                </p>
                <p className="mt-1 font-semibold text-coffee-dark">
                  {selectedEmployee.loginId}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-coffee/40">
                  Role
                </p>
                <p className="mt-1 font-semibold text-coffee-dark">
                  {ROLE_LABELS[selectedEmployee.role]}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-coffee/40">
                  Status
                </p>
                <p className="mt-1 font-semibold text-coffee-dark">
                  {selectedEmployee.status}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-coffee/40">
                  Branch
                </p>
                <p className="mt-1 font-semibold text-coffee-dark">
                  {selectedEmployee.branch?.name || 'Unassigned'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-coffee/40">
                  Department
                </p>
                <p className="mt-1 font-semibold text-coffee-dark">
                  {selectedEmployee.department || '-'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-coffee/40">
                  Email
                </p>
                <p className="mt-1 break-all font-semibold text-coffee-dark">
                  {selectedEmployee.email || '-'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-coffee/40">
                  Phone
                </p>
                <p className="mt-1 font-semibold text-coffee-dark">
                  {selectedEmployee.phone || '-'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-coffee/40">
                  Joining Date
                </p>
                <p className="mt-1 font-semibold text-coffee-dark">
                  {formatDate(selectedEmployee.joiningDate)}
                </p>
              </div>

              {selectedEmployee.managesBranch && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-coffee/40">
                    Manages Branch
                  </p>
                  <p className="mt-1 font-semibold text-coffee-dark">
                    {selectedEmployee.managesBranch.name}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-coffee/10 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl bg-coffee-dark px-5 py-2.5 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role modal */}
      {modal === 'role' && selectedEmployee && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={saveRole}
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
          >
            <div className="border-b border-coffee/10 px-6 py-5">
              <h2 className="font-serif text-2xl font-bold text-coffee-dark">
                Change Role
              </h2>

              <p className="mt-1 text-sm text-coffee/50">
                {selectedEmployee.fullName}
              </p>
            </div>

            <div className="p-6">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">
                  New Role
                </span>

                <select
                  value={newRole}
                  onChange={(event) =>
                    setNewRole(event.target.value as Role)
                  }
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 text-sm outline-none focus:border-turmeric"
                >
                  {ROLE_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {ROLE_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-coffee/10 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-coffee/10 px-5 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-turmeric px-5 py-2.5 text-sm font-bold text-coffee-dark disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Change Role'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Branch modal */}
      {modal === 'branch' && selectedEmployee && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={saveBranch}
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
          >
            <div className="border-b border-coffee/10 px-6 py-5">
              <h2 className="font-serif text-2xl font-bold text-coffee-dark">
                Assign Branch
              </h2>

              <p className="mt-1 text-sm text-coffee/50">
                {selectedEmployee.fullName}
              </p>
            </div>

            <div className="p-6">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">
                  Branch
                </span>

                <select
                  value={newBranchId}
                  onChange={(event) =>
                    setNewBranchId(event.target.value)
                  }
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 text-sm outline-none focus:border-turmeric"
                >
                  <option value="">Select branch</option>

                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-coffee/10 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-coffee/10 px-5 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-turmeric px-5 py-2.5 text-sm font-bold text-coffee-dark disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Assign Branch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Password modal */}
      {modal === 'password' && selectedEmployee && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={savePassword}
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
          >
            <div className="border-b border-coffee/10 px-6 py-5">
              <h2 className="font-serif text-2xl font-bold text-coffee-dark">
                Reset Password
              </h2>

              <p className="mt-1 text-sm text-coffee/50">
                Reset login password for {selectedEmployee.fullName}.
              </p>
            </div>

            <div className="p-6">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">
                  New Password
                </span>

                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) =>
                    setNewPassword(event.target.value)
                  }
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 text-sm outline-none focus:border-turmeric"
                  minLength={6}
                  required
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-coffee/10 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-coffee/10 px-5 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-turmeric px-5 py-2.5 text-sm font-bold text-coffee-dark disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Reset Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
