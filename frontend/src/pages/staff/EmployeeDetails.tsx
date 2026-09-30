import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal" },
  { id: "employment", label: "Employment" },
  { id: "documents", label: "Documents" },
  { id: "attendance", label: "Attendance" },
  { id: "leave", label: "Leave" },
  { id: "payroll", label: "Payroll" },
];

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  SERVICE_EMPLOYEE: "Service Employee",
  KITCHEN_EMPLOYEE: "Kitchen Employee",
  BILLING_EMPLOYEE: "Billing Employee",
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

const formatMoney = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `₹${number.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getErrorMessage = (err: any, fallback: string) =>
  err?.response?.data?.message ||
  err?.response?.data?.error ||
  err?.message ||
  fallback;

const getPayload = (response: any) => response?.data ?? {};

const getEmployeePhotoUrl = (storageKey?: string | null) => {
  if (!storageKey) return null;
  const baseUrl = api.defaults.baseURL?.replace(/\/api\/?$/, "");
  if (!baseUrl) return null;
  return `${baseUrl}/uploads/${storageKey}`;
};

const getDocumentUrl = (documentId: string) => {
  const baseUrl = api.defaults.baseURL?.replace(/\/api\/?$/, "");
  if (!baseUrl) return "";
  return `${baseUrl}/api/employees/v2/${documentId}`;
};

type AttendanceRecord = {
  id: string;
  employeeId: string;
  date: string;
  status?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workingHours?: string | number | null;
  remarks?: string | null;
  branch?: { name?: string | null };
};

type LeaveRecord = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status?: string;
  reason?: string | null;
  remarks?: string | null;
};

type PayrollRecord = {
  id: string;
  payrollMonth?: string | null;
  status?: string | null;
  grossSalary?: string | number | null;
  totalDeductions?: string | number | null;
  netSalary?: string | number | null;
  employee?: { fullName?: string | null };
};

type SalaryStructure = {
  id: string;
  employeeId: string;
  basicSalary?: string | number | null;
  allowances?: string | number | null;
  overtimeRate?: string | number | null;
  deductions?: string | number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive?: boolean;
};

export default function EmployeeDetails() {
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { employee: currentUser } = useAuth();

  const canManage =
    currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "MANAGER";
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const [activeSection, setActiveSection] = React.useState("overview");
  const [employee, setEmployee] = React.useState<any>(null);
  const [profile, setProfile] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [photoUploading, setPhotoUploading] = React.useState(false);
  const [photoError, setPhotoError] = React.useState("");

  const [profileForm, setProfileForm] = React.useState({
    dateOfBirth: "",
    gender: "",
    address: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
  });
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileMessage, setProfileMessage] = React.useState("");

  const [documents, setDocuments] = React.useState<any[]>([]);
  const [documentsLoading, setDocumentsLoading] = React.useState(false);
  const [documentUploading, setDocumentUploading] = React.useState(false);
  const [documentMessage, setDocumentMessage] = React.useState("");
  const [documentError, setDocumentError] = React.useState("");
  const [documentType, setDocumentType] = React.useState("");
  const [documentNumber, setDocumentNumber] = React.useState("");

  const [attendance, setAttendance] = React.useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = React.useState(false);
  const [attendanceError, setAttendanceError] = React.useState("");

  const [leaves, setLeaves] = React.useState<LeaveRecord[]>([]);
  const [leaveLoading, setLeaveLoading] = React.useState(false);
  const [leaveError, setLeaveError] = React.useState("");
  const [leaveActionId, setLeaveActionId] = React.useState("");

  const [salaryStructure, setSalaryStructure] =
    React.useState<SalaryStructure | null>(null);
  const [salaryLoading, setSalaryLoading] = React.useState(false);
  const [salarySaving, setSalarySaving] = React.useState(false);
  const [salaryMessage, setSalaryMessage] = React.useState("");
  const [salaryError, setSalaryError] = React.useState("");
  const [salaryForm, setSalaryForm] = React.useState({
    basicSalary: "",
    allowances: "",
    overtimeRate: "",
    deductions: "",
    effectiveFrom: "",
    effectiveTo: "",
    isActive: true,
  });

  const [payrollRecords, setPayrollRecords] = React.useState<PayrollRecord[]>(
    [],
  );
  const [payrollLoading, setPayrollLoading] = React.useState(false);
  const [payrollError, setPayrollError] = React.useState("");
  const [payrollActionId, setPayrollActionId] = React.useState("");

  const setProfileFormFromData = React.useCallback((value: any) => {
    setProfileForm({
      dateOfBirth: value?.dateOfBirth
        ? new Date(value.dateOfBirth).toISOString().slice(0, 10)
        : "",
      gender: value?.gender || "",
      address: value?.address || "",
      emergencyContactName: value?.emergencyContactName || "",
      emergencyContactPhone: value?.emergencyContactPhone || "",
      emergencyContactRelation: value?.emergencyContactRelation || "",
    });
  }, []);

  const loadEmployee = React.useCallback(async () => {
    if (!employeeId) {
      setError("Employee ID is missing.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await api.get(`/employees/v2/${employeeId}/profile`);
      const data = getPayload(response);
      const nextEmployee = data?.employee || data?.data?.employee || null;
      const nextProfile = data?.profile || data?.data?.profile || null;

      setEmployee(nextEmployee);
      setProfile(nextProfile);
      setProfileFormFromData(nextProfile);
    } catch (err: any) {
      setError(getErrorMessage(err, "Unable to load employee details."));
    } finally {
      setLoading(false);
    }
  }, [employeeId, setProfileFormFromData]);

  const uploadEmployeePhoto = async (file: File) => {
    if (!employeeId || !canManage) return;

    try {
      setPhotoUploading(true);
      setPhotoError("");
      const formData = new FormData();
      formData.append("photo", file);

      const response = await api.post(
        `/employees/v2/${employeeId}/photo`,
        formData,
      );

      const updatedEmployee = getPayload(response)?.employee;
      if (updatedEmployee) {
        setEmployee((current: any) =>
          current ? { ...current, ...updatedEmployee } : current,
        );
      }
    } catch (err: any) {
      setPhotoError(getErrorMessage(err, "Unable to upload employee photo."));
    } finally {
      setPhotoUploading(false);
    }
  };

  const loadDocuments = React.useCallback(async () => {
    if (!employeeId || !canManage) return;

    try {
      setDocumentsLoading(true);
      setDocumentError("");
      const response = await api.get(`/employees/v2/${employeeId}/documents`);
      const data = getPayload(response);
      setDocuments(
        data?.documents ||
          data?.data?.documents ||
          data?.employee?.documents ||
          [],
      );
    } catch (err: any) {
      setDocumentError(getErrorMessage(err, "Unable to load documents."));
    } finally {
      setDocumentsLoading(false);
    }
  }, [employeeId, canManage]);

  const uploadDocument = async (file: File) => {
    if (!employeeId || !canManage) return;
    if (!documentType.trim()) {
      setDocumentError("Please enter a document type before uploading.");
      return;
    }

    try {
      setDocumentUploading(true);
      setDocumentError("");
      setDocumentMessage("");

      const formData = new FormData();
      formData.append("document", file);
      formData.append("documentType", documentType.trim());
      if (documentNumber.trim()) {
        formData.append("documentNumber", documentNumber.trim());
      }

      await api.post(`/employees/v2/${employeeId}/documents`, formData);

      setDocumentType("");
      setDocumentNumber("");
      setDocumentMessage("Document uploaded successfully.");
      await loadDocuments();
    } catch (err: any) {
      setDocumentError(getErrorMessage(err, "Unable to upload document."));
    } finally {
      setDocumentUploading(false);
    }
  };

  const deleteDocument = async (documentId: string) => {
    if (!canManage) return;
    if (!window.confirm("Delete this employee document?")) return;

    try {
      setDocumentError("");
      await api.delete(`/employees/v2/${employeeId}/documents/${documentId}`);
      setDocuments((items) => items.filter((item) => item.id !== documentId));
    } catch (err: any) {
      setDocumentError(getErrorMessage(err, "Unable to delete document."));
    }
  };

  const loadAttendance = React.useCallback(async () => {
    if (!employeeId) return;

    try {
      setAttendanceLoading(true);
      setAttendanceError("");

      const response = await api.get("/attendance", {
        params: { employeeId },
      });

     const data = getPayload(response);

setAttendance(
  Array.isArray(data)
    ? data
    : data?.attendance ||
      data?.records ||
      data?.data?.attendance ||
      data?.data?.records ||
      [],
);
    } catch (err: any) {
      setAttendanceError(
        getErrorMessage(err, "Unable to load attendance history."),
      );
    } finally {
      setAttendanceLoading(false);
    }
  }, [employeeId]);

  const loadLeaves = React.useCallback(async () => {
    if (!employeeId) return;

    try {
      setLeaveLoading(true);
      setLeaveError("");

      const response = await api.get("/attendance/leaves/list", {
        params: { employeeId },
      });

      const data = getPayload(response);
      setLeaves(
        data?.leaves ||
          data?.records ||
          data?.data?.leaves ||
          data?.data?.records ||
          [],
      );
    } catch (err: any) {
      setLeaveError(getErrorMessage(err, "Unable to load leave history."));
    } finally {
      setLeaveLoading(false);
    }
  }, [employeeId]);

  const updateLeaveStatus = async (
    leaveId: string,
    status: "APPROVED" | "REJECTED",
  ) => {
    if (!canManage) return;

    try {
      setLeaveActionId(leaveId);
      setLeaveError("");

      await api.patch(`/attendance/leaves/${leaveId}/status`, { status });
      await loadLeaves();
    } catch (err: any) {
      setLeaveError(getErrorMessage(err, "Unable to update leave status."));
    } finally {
      setLeaveActionId("");
    }
  };

  const loadPayroll = React.useCallback(async () => {
    if (!employeeId || !canManage) return;

    try {
      setSalaryLoading(true);
      setPayrollLoading(true);
      setSalaryError("");
      setPayrollError("");

      const [salaryResponse, payrollResponse] = await Promise.all([
        api.get(`/payroll/salary-structures/${employeeId}`),
        api.get("/payroll/records", {
          params: { employeeId, page: 1, limit: 100 },
        }),
      ]);

      const salaryData = getPayload(salaryResponse);
      const nextSalary =
        salaryData?.salaryStructure ||
        salaryData?.salary ||
        salaryData?.data?.salaryStructure ||
        null;

      setSalaryStructure(nextSalary);

      if (nextSalary) {
        setSalaryForm({
          basicSalary: nextSalary.basicSalary ?? "",
          allowances: nextSalary.allowances ?? "",
          overtimeRate: nextSalary.overtimeRate ?? "",
          deductions: nextSalary.deductions ?? "",
          effectiveFrom: nextSalary.effectiveFrom
            ? new Date(nextSalary.effectiveFrom).toISOString().slice(0, 10)
            : "",
          effectiveTo: nextSalary.effectiveTo
            ? new Date(nextSalary.effectiveTo).toISOString().slice(0, 10)
            : "",
          isActive: Boolean(nextSalary.isActive),
        });
      }

      const payrollData = getPayload(payrollResponse);
      setPayrollRecords(
        payrollData?.payrollRecords ||
          payrollData?.records ||
          payrollData?.data?.payrollRecords ||
          [],
      );
    } catch (err: any) {
      const message = getErrorMessage(err, "Unable to load payroll data.");
      setSalaryError(message);
      setPayrollError(message);
    } finally {
      setSalaryLoading(false);
      setPayrollLoading(false);
    }
  }, [employeeId, canManage]);

  const saveProfile = async () => {
    if (!employeeId || !canManage) return;

    try {
      setProfileSaving(true);
      setProfileMessage("");

      const response = await api.put(
        `/employees/v2/${employeeId}/profile`,
        {
          dateOfBirth: profileForm.dateOfBirth
            ? new Date(profileForm.dateOfBirth).toISOString()
            : null,
          gender: profileForm.gender || null,
          address: profileForm.address || null,
          emergencyContactName: profileForm.emergencyContactName || null,
          emergencyContactPhone: profileForm.emergencyContactPhone || null,
          emergencyContactRelation:
            profileForm.emergencyContactRelation || null,
        },
      );

      const updatedProfile =
        getPayload(response)?.profile || profileForm;

      setProfile(updatedProfile);
      setProfileFormFromData(updatedProfile);
      setProfileMessage("Personal information saved successfully.");
    } catch (err: any) {
      setProfileMessage(getErrorMessage(err, "Unable to save personal information."));
    } finally {
      setProfileSaving(false);
    }
  };

  const saveSalaryStructure = async () => {
    if (!canManage || !employeeId) return;

    try {
      setSalarySaving(true);
      setSalaryMessage("");
      setSalaryError("");

      const payload = {
        basicSalary: Number(salaryForm.basicSalary || 0),
        allowances: Number(salaryForm.allowances || 0),
        overtimeRate: Number(salaryForm.overtimeRate || 0),
        deductions: Number(salaryForm.deductions || 0),
        effectiveFrom: salaryForm.effectiveFrom,
        effectiveTo: salaryForm.effectiveTo || null,
        isActive: salaryForm.isActive,
      };

      if (salaryStructure?.id) {
        await api.put(
          `/payroll/salary-structures/${salaryStructure.id}`,
          payload,
        );
      } else {
        await api.post("/payroll/salary-structures", {
          employeeId,
          ...payload,
        });
      }

      setSalaryMessage("Salary structure saved successfully.");
      await loadPayroll();
    } catch (err: any) {
      setSalaryError(
        getErrorMessage(err, "Unable to save salary structure."),
      );
    } finally {
      setSalarySaving(false);
    }
  };

  const updatePayrollWorkflow = async (
    payrollId: string,
    action: "review" | "approve" | "lock" | "unlock",
  ) => {
    if (!canManage) return;
    if (action === "unlock" && !isSuperAdmin) return;

    try {
      setPayrollActionId(payrollId);
      setPayrollError("");

      await api.post(`/payroll/${payrollId}/${action}`);
      await loadPayroll();
    } catch (err: any) {
      setPayrollError(
        getErrorMessage(err, `Unable to ${action} payroll record.`),
      );
    } finally {
      setPayrollActionId("");
    }
  };

  React.useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  React.useEffect(() => {
    if (activeSection === "documents") loadDocuments();
    if (activeSection === "attendance") loadAttendance();
    if (activeSection === "leave") loadLeaves();
    if (activeSection === "payroll") loadPayroll();
  }, [
    activeSection,
    loadDocuments,
    loadAttendance,
    loadLeaves,
    loadPayroll,
  ]);

  const renderLoading = (message: string) => (
    <div className="flex min-h-[240px] items-center justify-center">
      <p className="text-sm text-coffee/60">{message}</p>
    </div>
  );

  const renderOverview = () => {
    if (loading) return renderLoading("Loading employee details...");

    if (error) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      );
    }

    if (!employee) {
      return (
        <div className="rounded-xl border border-coffee/10 bg-cream p-4">
          <p className="text-sm text-coffee/70">
            Employee details were not found.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-coffee/10 bg-cream p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-turmeric text-2xl font-bold text-coffee-dark">
              {getEmployeePhotoUrl(employee.photoStorageKey) ? (
                <img
                  src={getEmployeePhotoUrl(employee.photoStorageKey) || undefined}
                  alt={employee.fullName || "Employee"}
                  className="h-full w-full object-cover"
                />
              ) : (
                (employee.fullName || "?").charAt(0).toUpperCase()
              )}
            </div>

            <div>
              <h2 className="text-2xl font-bold text-coffee-dark">
                {employee.fullName || "-"}
              </h2>

              <p className="mt-1 text-sm text-coffee/60">
                {employee.loginId || "-"}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-coffee">
                  {roleLabels[employee.role] || employee.role || "-"}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-coffee">
                  {employee.status || "-"}
                </span>
              </div>

              {canManage && (
                <div className="mt-3">
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-coffee/20 bg-white px-3 py-1.5 text-xs font-medium text-coffee hover:bg-cream">
                    {photoUploading ? "Uploading..." : "Change Photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={photoUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadEmployeePhoto(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {photoError && (
                    <p className="mt-2 text-xs font-medium text-red-600">
                      {photoError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-lg font-bold text-coffee-dark">
            Basic Information
          </h3>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Employee ID", employee.id],
              ["Phone", employee.phone],
              ["Email", employee.email],
              ["Department", employee.department],
              ["Joining Date", formatDate(employee.joiningDate)],
              ["Branch", employee.branch?.name || employee.branchId],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-coffee/10 p-4">
                <p className="text-xs text-coffee/50">{label}</p>
                <p className="mt-1 break-words font-medium text-coffee-dark">
                  {value || "-"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPersonal = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-coffee-dark">Personal Information</h2>
        <p className="mt-1 text-sm text-coffee/60">
          Personal and emergency-contact information for this employee.
        </p>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-coffee/10 bg-cream p-4 text-sm text-coffee/70">
          Personal information editing is available to Super Admin and Manager.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Date of Birth", "dateOfBirth", "date"],
              ["Gender", "gender", "text"],
              ["Address", "address", "text"],
              ["Emergency Contact Name", "emergencyContactName", "text"],
              ["Emergency Contact Phone", "emergencyContactPhone", "text"],
              ["Emergency Contact Relation", "emergencyContactRelation", "text"],
            ].map(([label, key, type]) => (
              <label key={key} className={key === "address" ? "sm:col-span-2" : ""}>
                <span className="mb-1 block text-xs font-semibold text-coffee/60">
                  {label}
                </span>
                <input
                  type={type}
                  value={(profileForm as any)[key]}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-coffee/15 px-3 py-2 text-sm outline-none focus:border-turmeric"
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={saveProfile}
            disabled={profileSaving}
            className="rounded-lg bg-turmeric px-4 py-2 text-sm font-semibold text-coffee-dark disabled:opacity-60"
          >
            {profileSaving ? "Saving..." : "Save Personal Information"}
          </button>

          {profileMessage && (
            <p className="text-sm font-medium text-coffee/70">{profileMessage}</p>
          )}
        </>
      )}
    </div>
  );

  const renderEmployment = () => {
    if (!employee) return renderLoading("Loading employment information...");

    const fields = [
      ["Employee ID", employee.id],
      ["Role", roleLabels[employee.role] || employee.role],
      ["Department", employee.department],
      ["Status", employee.status],
      ["Joining Date", formatDate(employee.joiningDate)],
      ["Branch", employee.branch?.name || employee.branchId],
      ["Login ID", employee.loginId],
    ];

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-coffee-dark">Employment</h2>
          <p className="mt-1 text-sm text-coffee/60">
            Current employment assignment and account information.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-coffee/10 p-4">
              <p className="text-xs text-coffee/50">{label}</p>
              <p className="mt-1 font-medium text-coffee-dark">{value || "-"}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-coffee/10 bg-cream p-4 text-sm text-coffee/70">
          Role, branch, status and password administration remain controlled by
          the existing Employees management workflow. This page displays the
          authoritative current values without duplicating those controls.
        </div>
      </div>
    );
  };

  const renderDocuments = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-coffee-dark">Documents</h2>
        <p className="mt-1 text-sm text-coffee/60">
          Employee documents stored against this employee record.
        </p>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-coffee/10 bg-cream p-4 text-sm text-coffee/70">
          Employee document access is restricted to Super Admin and Manager.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-coffee/10 bg-cream p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
                placeholder="Document type (Aadhaar, PAN, Contract...)"
                className="rounded-lg border border-coffee/15 px-3 py-2 text-sm"
              />
              <input
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                placeholder="Document number (optional)"
                className="rounded-lg border border-coffee/15 px-3 py-2 text-sm"
              />
            </div>

            <label className="mt-3 inline-flex cursor-pointer rounded-lg bg-turmeric px-4 py-2 text-sm font-semibold text-coffee-dark">
              {documentUploading ? "Uploading..." : "Upload Document"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                disabled={documentUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadDocument(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            {documentMessage && (
              <p className="mt-2 text-sm text-green-700">{documentMessage}</p>
            )}
            {documentError && (
              <p className="mt-2 text-sm text-red-600">{documentError}</p>
            )}
          </div>

          {documentsLoading ? (
            renderLoading("Loading documents...")
          ) : documents.length === 0 ? (
            <div className="rounded-xl border border-coffee/10 p-5 text-sm text-coffee/60">
              No documents uploaded for this employee.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-coffee/10">
              <table className="min-w-full text-sm">
                <thead className="bg-cream text-left text-xs uppercase text-coffee/60">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Number</th>
                    <th className="px-4 py-3">File</th>
                    <th className="px-4 py-3">Uploaded</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => {
                    const url =
                      document.documentUrl ||
                      getDocumentUrl(document.id);

                    return (
                      <tr key={document.id} className="border-t border-coffee/10">
                        <td className="px-4 py-3 font-medium">
                          {document.documentType || "-"}
                        </td>
                        <td className="px-4 py-3">{document.documentNumber || "-"}</td>
                        <td className="px-4 py-3">
                          {document.originalFileName || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {formatDate(document.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-coffee/15 px-3 py-1.5 text-xs font-semibold text-coffee hover:bg-cream"
                              >
                                View
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteDocument(document.id)}
                              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderAttendance = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-coffee-dark">Attendance</h2>
        <p className="mt-1 text-sm text-coffee/60">
          Attendance history for {employee?.fullName || "this employee"}.
        </p>
      </div>

      {attendanceError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {attendanceError}
        </div>
      )}

      {attendanceLoading ? (
        renderLoading("Loading attendance history...")
      ) : attendance.length === 0 ? (
        <div className="rounded-xl border border-coffee/10 p-5 text-sm text-coffee/60">
          No attendance records found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-coffee/10">
          <table className="min-w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase text-coffee/60">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Check In</th>
                <th className="px-4 py-3">Check Out</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((record) => (
                <tr key={record.id} className="border-t border-coffee/10">
                  <td className="px-4 py-3">{formatDate(record.date)}</td>
                  <td className="px-4 py-3">{record.status || "-"}</td>
                  <td className="px-4 py-3">
                    {record.checkIn ? formatDate(record.checkIn) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {record.checkOut ? formatDate(record.checkOut) : "-"}
                  </td>
                  <td className="px-4 py-3">{record.workingHours ?? "-"}</td>
                  <td className="px-4 py-3">{record.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={loadAttendance}
        className="rounded-lg border border-coffee/15 px-4 py-2 text-sm font-semibold text-coffee hover:bg-cream"
      >
        Refresh Attendance
      </button>
    </div>
  );

  const renderLeave = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-coffee-dark">Leave</h2>
        <p className="mt-1 text-sm text-coffee/60">
          Leave requests and approval status for this employee.
        </p>
      </div>

      {leaveError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {leaveError}
        </div>
      )}

      {leaveLoading ? (
        renderLoading("Loading leave history...")
      ) : leaves.length === 0 ? (
        <div className="rounded-xl border border-coffee/10 p-5 text-sm text-coffee/60">
          No leave records found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-coffee/10">
          <table className="min-w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase text-coffee/60">
              <tr>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {leaves.map((leave) => (
                <tr key={leave.id} className="border-t border-coffee/10">
                  <td className="px-4 py-3">{formatDate(leave.startDate)}</td>
                  <td className="px-4 py-3">{formatDate(leave.endDate)}</td>
                  <td className="px-4 py-3">{leave.reason || "-"}</td>
                  <td className="px-4 py-3">{leave.status || "-"}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {leave.status === "PENDING" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={leaveActionId === leave.id}
                            onClick={() =>
                              updateLeaveStatus(leave.id, "APPROVED")
                            }
                            className="rounded-md bg-turmeric px-3 py-1.5 text-xs font-semibold text-coffee-dark disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={leaveActionId === leave.id}
                            onClick={() =>
                              updateLeaveStatus(leave.id, "REJECTED")
                            }
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={loadLeaves}
        className="rounded-lg border border-coffee/15 px-4 py-2 text-sm font-semibold text-coffee hover:bg-cream"
      >
        Refresh Leave
      </button>
    </div>
  );

  const renderPayroll = () => {
    if (!canManage) {
      return (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-coffee-dark">Payroll</h2>
          <div className="rounded-xl border border-coffee/10 bg-cream p-4 text-sm text-coffee/70">
            Payroll details are restricted to Super Admin and Manager.
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-coffee-dark">Payroll</h2>
          <p className="mt-1 text-sm text-coffee/60">
            Salary structure and payroll history for this employee.
          </p>
        </div>

        {salaryError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {salaryError}
          </div>
        )}

        <div className="rounded-2xl border border-coffee/10 bg-cream p-5">
          <h3 className="mb-4 text-lg font-bold text-coffee-dark">
            Salary Structure
          </h3>

          {salaryLoading ? (
            <p className="text-sm text-coffee/60">Loading salary structure...</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Basic Salary", "basicSalary"],
                  ["Allowances", "allowances"],
                  ["Overtime Rate", "overtimeRate"],
                  ["Deductions", "deductions"],
                ].map(([label, key]) => (
                  <label key={key}>
                    <span className="mb-1 block text-xs font-semibold text-coffee/60">
                      {label}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={(salaryForm as any)[key]}
                      onChange={(event) =>
                        setSalaryForm((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-coffee/15 px-3 py-2 text-sm"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-xs font-semibold text-coffee/60">
                    Effective From
                  </span>
                  <input
                    type="date"
                    value={salaryForm.effectiveFrom}
                    onChange={(event) =>
                      setSalaryForm((current) => ({
                        ...current,
                        effectiveFrom: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-coffee/15 px-3 py-2 text-sm"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-xs font-semibold text-coffee/60">
                    Effective To
                  </span>
                  <input
                    type="date"
                    value={salaryForm.effectiveTo}
                    onChange={(event) =>
                      setSalaryForm((current) => ({
                        ...current,
                        effectiveTo: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-coffee/15 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm font-medium text-coffee">
                <input
                  type="checkbox"
                  checked={salaryForm.isActive}
                  onChange={(event) =>
                    setSalaryForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
                Active salary structure
              </label>

              <button
                type="button"
                onClick={saveSalaryStructure}
                disabled={salarySaving}
                className="mt-4 rounded-lg bg-turmeric px-4 py-2 text-sm font-semibold text-coffee-dark disabled:opacity-60"
              >
                {salarySaving ? "Saving..." : "Save Salary Structure"}
              </button>

              {salaryMessage && (
                <p className="mt-2 text-sm text-green-700">{salaryMessage}</p>
              )}
            </>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-lg font-bold text-coffee-dark">
            Payroll History
          </h3>

          {payrollError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {payrollError}
            </div>
          )}

          {payrollLoading ? (
            renderLoading("Loading payroll records...")
          ) : payrollRecords.length === 0 ? (
            <div className="rounded-xl border border-coffee/10 p-5 text-sm text-coffee/60">
              No payroll records found.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-coffee/10">
              <table className="min-w-full text-sm">
                <thead className="bg-cream text-left text-xs uppercase text-coffee/60">
                  <tr>
                    <th className="px-4 py-3">Month</th>
                    <th className="px-4 py-3">Gross</th>
                    <th className="px-4 py-3">Deductions</th>
                    <th className="px-4 py-3">Net</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Workflow</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollRecords.map((record) => (
                    <tr key={record.id} className="border-t border-coffee/10">
                      <td className="px-4 py-3">
                        {record.payrollMonth
                          ? formatDate(record.payrollMonth)
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {formatMoney(record.grossSalary)}
                      </td>
                      <td className="px-4 py-3">
                        {formatMoney(record.totalDeductions)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatMoney(record.netSalary)}
                      </td>
                      <td className="px-4 py-3">{record.status || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {record.status === "DRAFT" && (
                            <button
                              type="button"
                              disabled={payrollActionId === record.id}
                              onClick={() =>
                                updatePayrollWorkflow(record.id, "review")
                              }
                              className="rounded-md bg-turmeric px-2.5 py-1.5 text-xs font-semibold text-coffee-dark"
                            >
                              Review
                            </button>
                          )}

                          {record.status === "REVIEWED" && (
                            <button
                              type="button"
                              disabled={payrollActionId === record.id}
                              onClick={() =>
                                updatePayrollWorkflow(record.id, "approve")
                              }
                              className="rounded-md bg-turmeric px-2.5 py-1.5 text-xs font-semibold text-coffee-dark"
                            >
                              Approve
                            </button>
                          )}

                          {record.status === "APPROVED" && (
                            <button
                              type="button"
                              disabled={payrollActionId === record.id}
                              onClick={() =>
                                updatePayrollWorkflow(record.id, "lock")
                              }
                              className="rounded-md bg-turmeric px-2.5 py-1.5 text-xs font-semibold text-coffee-dark"
                            >
                              Lock
                            </button>
                          )}

                          {record.status === "LOCKED" && isSuperAdmin && (
                            <button
                              type="button"
                              disabled={payrollActionId === record.id}
                              onClick={() =>
                                updatePayrollWorkflow(record.id, "unlock")
                              }
                              className="rounded-md border border-coffee/15 px-2.5 py-1.5 text-xs font-semibold text-coffee"
                            >
                              Unlock
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

          <button
            type="button"
            onClick={loadPayroll}
            className="mt-4 rounded-lg border border-coffee/15 px-4 py-2 text-sm font-semibold text-coffee hover:bg-cream"
          >
            Refresh Payroll
          </button>
        </div>
      </div>
    );
  };

  const renderSection = () => {
    switch (activeSection) {
      case "overview":
        return renderOverview();
      case "personal":
        return renderPersonal();
      case "employment":
        return renderEmployment();
      case "documents":
        return renderDocuments();
      case "attendance":
        return renderAttendance();
      case "leave":
        return renderLeave();
      case "payroll":
        return renderPayroll();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate("/staff/employees")}
            className="mb-2 text-sm font-medium text-coffee hover:underline"
          >
            ← Back to Employees
          </button>

          <h1 className="font-serif text-3xl font-bold text-coffee-dark">
            Employee Details
          </h1>

          <p className="mt-1 text-sm text-coffee/60">
            Employee ID: {employeeId || "-"}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <aside className="h-fit rounded-2xl border border-coffee/10 bg-white p-3 shadow-sm">
            <div className="mb-3 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-coffee/50">
                Employee Menu
              </p>
            </div>

            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    activeSection === section.id
                      ? "bg-turmeric text-coffee-dark"
                      : "text-coffee hover:bg-cream"
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </aside>

          <main className="rounded-2xl border border-coffee/10 bg-white p-6 shadow-sm">
            {renderSection()}
          </main>
        </div>
      </div>
    </div>
  );
}
