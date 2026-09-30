import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
type Role =
  | "SUPER_ADMIN"
  | "MANAGER"
  | "SERVICE_EMPLOYEE"
  | "KITCHEN_EMPLOYEE"
  | "BILLING_EMPLOYEE";

type Employee = {
  id: string;
  employeeId?: string | null;
  name: string;
  loginId: string;
  phone?: string | null;
  email?: string | null;
  role: Role;
  status?: string;
  joiningDate?: string | null;
  photoStorageKey?: string | null;
  branch?: {
    id: string;
    name: string;
  } | null;
  managesBranch?: {
    id: string;
    name: string;
  } | null;
};

const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  SERVICE_EMPLOYEE: "Service Employee",
  KITCHEN_EMPLOYEE: "Kitchen Employee",
  BILLING_EMPLOYEE: "Billing Employee",
};

const roleOptions: Role[] = [
  "SUPER_ADMIN",
  "MANAGER",
  "SERVICE_EMPLOYEE",
  "KITCHEN_EMPLOYEE",
  "BILLING_EMPLOYEE",
];

const getErrorMessage = (error: any) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  "Something went wrong";


const getEmployeePhotoUrl = (storageKey?: string | null) => {
  if (!storageKey) return null;

  const baseUrl = api.defaults.baseURL?.replace(/\/api\/?$/, "");

  if (!baseUrl) return null;

  return `${baseUrl}/uploads/${storageKey}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function EmployeesEmployeeV2() {
  const { employee: currentUser } = useAuth();

  const canManageEmployeeDocuments =
    currentUser?.role === "SUPER_ADMIN" ||
    currentUser?.role === "MANAGER";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);

  const [employeeProfile, setEmployeeProfile] = useState<any>(null);

  const [photoUploading, setPhotoUploading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    loginId: "",
    password: "",
    phone: "",
    email: "",
    role: "SERVICE_EMPLOYEE" as Role,
    branchId: "",
    joiningDate: "",
  });

  const loadEmployees = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/employees");

      const data = response?.data;

      if (Array.isArray(data)) {
        setEmployees(data);
      } else if (Array.isArray(data?.employees)) {
        setEmployees(data.employees);
      } else {
        setEmployees([]);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async () => {
    try {
      const response = await api.get("/branches");

      const data = response?.data;

      if (Array.isArray(data)) {
        setBranches(data);
      } else if (Array.isArray(data?.branches)) {
        setBranches(data.branches);
      } else {
        setBranches([]);
      }
    } catch {
      setBranches([]);
    }
  };

  useEffect(() => {
    loadEmployees();
    loadBranches();
  }, []);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesSearch =
        !query ||
        employee.name?.toLowerCase().includes(query) ||
        employee.loginId?.toLowerCase().includes(query) ||
        employee.phone?.toLowerCase().includes(query) ||
        employee.email?.toLowerCase().includes(query);

      const matchesRole =
        roleFilter === "ALL" || employee.role === roleFilter;

      const matchesStatus =
        statusFilter === "ALL" ||
        String(employee.status || "").toUpperCase() === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [employees, search, roleFilter, statusFilter]);

  const activeCount = employees.filter(
    (employee) =>
      String(employee.status || "").toUpperCase() === "ACTIVE"
  ).length;

  const inactiveCount = employees.length - activeCount;

  const resetForm = () => {
    setForm({
      name: "",
      loginId: "",
      password: "",
      phone: "",
      email: "",
      role: "SERVICE_EMPLOYEE",
      branchId: "",
      joiningDate: "",
    });
  };

  const openCreate = () => {
    resetForm();
    setError("");
    setMessage("");
    setShowCreate(true);
  };

  const openEdit = (employee: Employee) => {
    setSelectedEmployee(employee);

    setForm({
      name: employee.name || "",
      loginId: employee.loginId || "",
      password: "",
      phone: employee.phone || "",
      email: employee.email || "",
      role: employee.role,
      branchId: employee.branch?.id || "",
      joiningDate: employee.joiningDate
        ? employee.joiningDate.substring(0, 10)
        : "",
    });

    setError("");
    setMessage("");
    setShowEdit(true);
  };

  const createEmployee = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setMessage("");

      await api.post("/employees", {
        name: form.name,
        loginId: form.loginId,
        password: form.password,
        phone: form.phone || undefined,
        email: form.email || undefined,
        role: form.role,
        branchId: form.branchId || undefined,
        joiningDate: form.joiningDate || undefined,
      });

      setMessage("Employee created successfully.");
      setShowCreate(false);
      resetForm();

      await loadEmployees();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const updateEmployee = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedEmployee) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");

      await api.patch(`/employees/${selectedEmployee.id}`, {
        name: form.name,
        loginId: form.loginId,
        phone: form.phone || undefined,
        email: form.email || undefined,
        role: form.role,
        branchId: form.branchId || undefined,
        joiningDate: form.joiningDate || undefined,
      });

      setMessage("Employee updated successfully.");
      setShowEdit(false);
      setSelectedEmployee(null);

      await loadEmployees();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (employee: Employee) => {
    const current =
      String(employee.status || "").toUpperCase() === "ACTIVE";

    const nextStatus = current ? "INACTIVE" : "ACTIVE";

    if (
      !window.confirm(
        `${current ? "Deactivate" : "Activate"} ${employee.name}?`
      )
    ) {
      return;
    }

    try {
      setError("");
      setMessage("");

      await api.patch(`/employees/${employee.id}/status`, {
        status: nextStatus,
      });

      setMessage(
        `${employee.name} ${
          current ? "deactivated" : "activated"
        } successfully.`
      );

      await loadEmployees();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const uploadEmployeePhoto = async (file: File) => {
    if (!selectedEmployee || !canManageEmployeeDocuments) return;

    try {
      setPhotoUploading(true);
      setError("");
      setMessage("");

      const formData = new FormData();
      formData.append("photo", file);

      const response = await api.post(
        `/employees/v2/${selectedEmployee.id}/photo`,
        formData
      );

      const updatedEmployee = response?.data?.employee;

      if (updatedEmployee) {
        setSelectedEmployee((current) =>
          current
            ? {
                ...current,
                ...updatedEmployee,
                photoStorageKey: updatedEmployee.photoStorageKey,
              }
            : current
        );
      }

      const profileResponse = await api.get(
        `/employees/v2/${selectedEmployee.id}/profile`
      );

      const profileData = profileResponse?.data;

      setEmployeeProfile(
        profileData?.profile ||
          profileData?.data?.profile ||
          profileData
      );

      if (profileData?.employee) {
        setSelectedEmployee(profileData.employee);
      }

      setMessage("Employee photo uploaded successfully.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPhotoUploading(false);
    }
  };

  const openView = async (employee: Employee) => {
    try {
      setError("");

      const response = await api.get(
        `/employees/v2/${employee.id}/profile`
      );

      const profileData = response?.data;

      setSelectedEmployee(
        profileData?.employee ||
          profileData?.data?.employee ||
          employee
      );

      setEmployeeProfile(
        profileData?.profile ||
          profileData?.data?.profile ||
          profileData
      );

      setShowView(true);
    } catch (err) {
      setEmployeeProfile(null);
      setSelectedEmployee(employee);
      setShowView(true);
      setError(getErrorMessage(err));
    }
  };
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Employee Management
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Manage employees, roles, branches and employment status.
            </p>
          </div>

          <button
            onClick={openCreate}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            + Add Employee
          </button>
        </div>

        {/* Messages */}
        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Total Employees"
            value={employees.length}
          />

          <SummaryCard
            title="Active"
            value={activeCount}
          />

          <SummaryCard
            title="Inactive"
            value={inactiveCount}
          />
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, login, phone..."
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ALL">All Roles</option>

              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            <button
              onClick={loadEmployees}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-5 py-4">Employee</th>
                  <th className="px-5 py-4">Phone</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Branch</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Joining Date</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-slate-500"
                    >
                      Loading employees...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-slate-500"
                    >
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((employee) => {
                    const isActive =
                      String(employee.status || "").toUpperCase() ===
                      "ACTIVE";

                    return (
                      <tr
                        key={employee.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700">
                              {employee.name?.charAt(0)?.toUpperCase() ||
                                "E"}
                            </div>

                            <div>
                              <div className="font-semibold text-slate-900">
                                {employee.name}
                              </div>

                              <div className="text-xs text-slate-500">
                                {employee.loginId}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {employee.phone || "-"}
                        </td>

                        <td className="px-5 py-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {roleLabels[employee.role] || employee.role}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {employee.branch?.name || "-"}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {employee.status || "UNKNOWN"}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {formatDate(employee.joiningDate)}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openView(employee)}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                            >
                              View
                            </button>

                            <button
                              onClick={() => openEdit(employee)}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => changeStatus(employee)}
                              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                                isActive
                                  ? "bg-red-50 text-red-700 hover:bg-red-100"
                                  : "bg-green-50 text-green-700 hover:bg-green-100"
                              }`}
                            >
                              {isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create */}
      {showCreate && (
        <Modal
          title="Add Employee"
          onClose={() => setShowCreate(false)}
        >
          <EmployeeForm
            form={form}
            setForm={setForm}
            branches={branches}
            mode="create"
            saving={saving}
            onSubmit={createEmployee}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {/* Edit */}
      {showEdit && selectedEmployee && (
        <Modal
          title={`Edit ${selectedEmployee.name}`}
          onClose={() => setShowEdit(false)}
        >
          <EmployeeForm
            form={form}
            setForm={setForm}
            branches={branches}
            mode="edit"
            saving={saving}
            onSubmit={updateEmployee}
            onCancel={() => setShowEdit(false)}
          />
        </Modal>
      )}

      {/* View */}
      {showView && selectedEmployee && (
        <Modal
          title="Employee Profile"
          onClose={() => setShowView(false)}
        >
          <div className="space-y-6">
            <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xl font-bold text-slate-700">
        {getEmployeePhotoUrl(selectedEmployee.photoStorageKey || employeeProfile?.photoStorageKey) ? (
          <img
            src={getEmployeePhotoUrl(
              selectedEmployee.photoStorageKey || employeeProfile?.photoStorageKey
            ) || undefined}
            alt={selectedEmployee.name}
            className="h-full w-full object-cover"
          />
        ) : (
          selectedEmployee.name
            ?.charAt(0)
            ?.toUpperCase() || "E"
        )}
      </div>

      {canManageEmployeeDocuments && (
        <div className="mt-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            {photoUploading ? "Uploading..." : "Change Photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={photoUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  uploadEmployeePhoto(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      )}

              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {selectedEmployee.name}
                </h2>

                <p className="text-sm text-slate-500">
                  {selectedEmployee.loginId}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ProfileItem
                label="Phone"
                value={selectedEmployee.phone}
              />

              <ProfileItem
                label="Email"
                value={selectedEmployee.email}
              />

              <ProfileItem
                label="Role"
                value={
                  roleLabels[selectedEmployee.role] ||
                  selectedEmployee.role
                }
              />

              <ProfileItem
                label="Branch"
                value={selectedEmployee.branch?.name}
              />

              <ProfileItem
                label="Status"
                value={selectedEmployee.status}
              />

              <ProfileItem
                label="Joining Date"
                value={formatDate(selectedEmployee.joiningDate)}
              />
            </div>

            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">
                Profile Documents
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Photo, identity proof and employee documents will be
                connected to the backend v2 upload APIs next.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function ProfileItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-medium uppercase text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-slate-800">
        {value || "-"}
      </p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {title}
          </h2>

          <button
            onClick={onClose}
            className="text-xl text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function EmployeeForm({
  form,
  setForm,
  branches,
  mode,
  saving,
  onSubmit,
  onCancel,
}: {
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  branches: any[];
  mode: "create" | "edit";
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const update = (field: string, value: string) => {
    setForm((current: any) => ({
      ...current,
      [field]: value,
    }));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Full Name" required>
          <input
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="input"
            placeholder="Employee name"
          />
        </Field>

        <Field label="Login ID" required>
          <input
            required
            value={form.loginId}
            onChange={(e) => update("loginId", e.target.value)}
            className="input"
            placeholder="Login ID"
          />
        </Field>

        {mode === "create" && (
          <Field label="Password" required>
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className="input"
              placeholder="Password"
            />
          </Field>
        )}

        <Field label="Phone">
          <input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="input"
            placeholder="Phone number"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="input"
            placeholder="Email address"
          />
        </Field>

        <Field label="Role" required>
          <select
            required
            value={form.role}
            onChange={(e) =>
              update("role", e.target.value as Role)
            }
            className="input"
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Branch">
          <select
            value={form.branchId}
            onChange={(e) => update("branchId", e.target.value)}
            className="input"
          >
            <option value="">Select Branch</option>

            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Joining Date">
          <input
            type="date"
            value={form.joiningDate}
            onChange={(e) =>
              update("joiningDate", e.target.value)
            }
            className="input"
          />
        </Field>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium"
        >
          Cancel
        </button>

        <button
          disabled={saving}
          type="submit"
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : mode === "create"
              ? "Create Employee"
              : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      {children}
    </label>
  );
}





