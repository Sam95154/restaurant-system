import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'LEAVE';

type LeaveStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

interface AttendanceRecord {
  id: string;
  employeeId: string;
  branchId: string;
  date: string;
  status: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  workingHours?: string | number | null;
  remarks?: string | null;
  employee?: {
    id: string;
    fullName: string;
    loginId?: string;
    role?: string;
    department?: string | null;
    branchId?: string;
  };
  branch?: {
    id: string;
    name: string;
  };
}

interface LeaveRecord {
  id: string;
  employeeId: string;
  branchId: string;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  reason?: string | null;
  remarks?: string | null;
  employee?: {
    id: string;
    fullName: string;
    loginId?: string;
    role?: string;
    department?: string | null;
    branchId?: string;
  };
  branch?: {
    id: string;
    name: string;
  };
}

interface Employee {
  id: string;
  fullName: string;
  loginId: string;
  role: string;
  department?: string | null;
  branchId?: string | null;
}

interface Branch {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  HALF_DAY: 'Half Day',
  LEAVE: 'Leave',
};

const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (value?: string | null) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const todayString = () => {
  return new Date().toISOString().slice(0, 10);
};

const getStatusClass = (status: AttendanceStatus) => {
  switch (status) {
    case 'PRESENT':
      return 'attendance-status present';
    case 'ABSENT':
      return 'attendance-status absent';
    case 'LATE':
      return 'attendance-status late';
    case 'HALF_DAY':
      return 'attendance-status half-day';
    case 'LEAVE':
      return 'attendance-status leave';
    default:
      return 'attendance-status';
  }
};

const getLeaveStatusClass = (status: LeaveStatus) => {
  switch (status) {
    case 'PENDING':
      return 'leave-status pending';
    case 'APPROVED':
      return 'leave-status approved';
    case 'REJECTED':
      return 'leave-status rejected';
    case 'CANCELLED':
      return 'leave-status cancelled';
    default:
      return 'leave-status';
  }
};

export default function Attendance() {
  const { employee } = useAuth();

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'attendance' | 'leaves'>(
    'attendance'
  );

  const [selectedBranchId, setSelectedBranchId] = useState(
    () =>
      employee?.branchId ||
      localStorage.getItem('selected_branch_id') ||
      ''
  );

  const branchId =
    employee?.role === 'SUPER_ADMIN'
      ? selectedBranchId
      : employee?.branchId || '';

  const isManager =
    employee?.role === 'SUPER_ADMIN' ||
    employee?.role === 'MANAGER';

  const [selectedDate, setSelectedDate] = useState(todayString());
  const [statusFilter, setStatusFilter] = useState<
    AttendanceStatus | 'ALL'
  >('ALL');
  const [search, setSearch] = useState('');

  const [leaveStatusFilter, setLeaveStatusFilter] = useState<
    LeaveStatus | 'ALL'
  >('ALL');

  const [showAttendanceModal, setShowAttendanceModal] =
    useState(false);

  const [showLeaveModal, setShowLeaveModal] = useState(false);

  const [attendanceForm, setAttendanceForm] = useState({
    employeeId: '',
    date: todayString(),
    status: 'PRESENT' as AttendanceStatus,
    checkIn: '',
    checkOut: '',
    workingHours: '',
    remarks: '',
  });

  const [leaveForm, setLeaveForm] = useState({
    employeeId: '',
    startDate: todayString(),
    endDate: todayString(),
    reason: '',
    remarks: '',
  });

  useEffect(() => {
    const handleBranchChanged = (event: Event) => {
      const branch =
        (event as CustomEvent<{ branchId?: string }>).detail
          ?.branchId || '';

      setSelectedBranchId(branch);
    };

    window.addEventListener('branchChanged', handleBranchChanged);

    return () => {
      window.removeEventListener(
        'branchChanged',
        handleBranchChanged
      );
    };
  }, []);

  useEffect(() => {
    if (employee?.branchId && employee.role !== 'SUPER_ADMIN') {
      setSelectedBranchId(employee.branchId);
    }
  }, [employee?.branchId, employee?.role]);

  useEffect(() => {
    loadData();
  }, [branchId, selectedDate, statusFilter, leaveStatusFilter]);

  const loadData = async () => {
    if (!branchId) {
      setAttendance([]);
      setLeaves([]);
      setEmployees([]);
      setBranches([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const attendanceParams: Record<string, string> = {
        branchId,
      };

      if (selectedDate) {
        attendanceParams.date = selectedDate;
      }

      if (statusFilter !== 'ALL') {
        attendanceParams.status = statusFilter;
      }

      const leaveParams: Record<string, string> = {
        branchId,
      };

      if (leaveStatusFilter !== 'ALL') {
        leaveParams.status = leaveStatusFilter;
      }

      const attendanceResponse = await api.get('/attendance', {
        params: attendanceParams,
      });

      setAttendance(
        Array.isArray(attendanceResponse.data)
          ? attendanceResponse.data
          : attendanceResponse.data?.attendance || []
      );

      // Leave loading is kept separate so a leave endpoint problem
      // does not prevent the Attendance tab from working.
      try {
        const leavesResponse = await api.get('/attendance/leaves/list', {
          params: leaveParams,
        });

        setLeaves(
          Array.isArray(leavesResponse.data)
            ? leavesResponse.data
            : leavesResponse.data?.leaves || []
        );
      } catch (error) {
        console.error('Failed to load leave requests:', error);
        setLeaves([]);
      }

      if (isManager) {
        try {
          const employeeResponse = await api.get('/employees', {
            params: {
              branchId,
            },
          });

          setEmployees(
            Array.isArray(employeeResponse.data)
              ? employeeResponse.data
              : employeeResponse.data?.employees || []
          );
        } catch (error) {
          console.error('Failed to load employees:', error);
          setEmployees([]);
        }
      } else {
        setEmployees([]);
      }

      if (employee?.role === 'SUPER_ADMIN') {
        try {
          const branchResponse = await api.get('/branches');

          setBranches(
            Array.isArray(branchResponse.data)
              ? branchResponse.data
              : branchResponse.data?.branches || []
          );
        } catch (error) {
          console.error('Failed to load branches:', error);
          setBranches([]);
        }
      }
    } catch (error: any) {
      console.error('Failed to load attendance data:', error);

      alert(
        error?.response?.data?.message ||
          'Failed to load attendance data'
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredAttendance = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return attendance;

    return attendance.filter((record) => {
      return (
        record.employee?.fullName
          ?.toLowerCase()
          .includes(query) ||
        record.employee?.loginId
          ?.toLowerCase()
          .includes(query) ||
        record.employee?.department
          ?.toLowerCase()
          .includes(query)
      );
    });
  }, [attendance, search]);

  const filteredLeaves = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return leaves;

    return leaves.filter((leave) => {
      return (
        leave.employee?.fullName
          ?.toLowerCase()
          .includes(query) ||
        leave.employee?.loginId
          ?.toLowerCase()
          .includes(query) ||
        leave.reason?.toLowerCase().includes(query)
      );
    });
  }, [leaves, search]);

  const stats = useMemo(() => {
    return {
      present: attendance.filter(
        (item) => item.status === 'PRESENT'
      ).length,
      absent: attendance.filter(
        (item) => item.status === 'ABSENT'
      ).length,
      late: attendance.filter(
        (item) => item.status === 'LATE'
      ).length,
      leave: attendance.filter(
        (item) => item.status === 'LEAVE'
      ).length,
      halfDay: attendance.filter(
        (item) => item.status === 'HALF_DAY'
      ).length,
    };
  }, [attendance]);

  const handleCheckIn = async () => {
    try {
      setActionLoading(true);

      await api.post('/attendance/check-in', {
        branchId,
        date: selectedDate,
      });

      alert('Check-in successful');

      await loadData();
    } catch (error: any) {
      alert(
        error?.response?.data?.message ||
          'Check-in failed'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionLoading(true);

      await api.post('/attendance/check-out', {
        date: selectedDate,
      });

      alert('Check-out successful');

      await loadData();
    } catch (error: any) {
      alert(
        error?.response?.data?.message ||
          'Check-out failed'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateAttendance = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (!attendanceForm.employeeId) {
      alert('Please select an employee');
      return;
    }

    try {
      setActionLoading(true);

      if (!branchId) {
        alert('Please select a branch');
        return;
      }

      const payload = {
        employeeId: attendanceForm.employeeId,
        branchId,
        date: attendanceForm.date,
        status: attendanceForm.status,
        checkIn: attendanceForm.checkIn
          ? new Date(
              `${attendanceForm.date}T${attendanceForm.checkIn}:00`
            ).toISOString()
          : null,
        checkOut: attendanceForm.checkOut
          ? new Date(
              `${attendanceForm.date}T${attendanceForm.checkOut}:00`
            ).toISOString()
          : null,
        workingHours: attendanceForm.workingHours
          ? Number(attendanceForm.workingHours)
          : null,
        remarks: attendanceForm.remarks || null,
      };

      // Attendance has a unique employee/date constraint.
      // Update an existing record instead of creating a duplicate.
      const existingResponse = await api.get('/attendance', {
        params: {
          branchId,
          employeeId: attendanceForm.employeeId,
          date: attendanceForm.date,
        },
      });

      const existingRecords: AttendanceRecord[] = Array.isArray(
        existingResponse.data
      )
        ? existingResponse.data
        : existingResponse.data?.attendance || [];

      if (existingRecords.length > 0) {
        await api.put(
          `/attendance/${existingRecords[0].id}`,
          {
            status: payload.status,
            checkIn: payload.checkIn,
            checkOut: payload.checkOut,
            workingHours: payload.workingHours,
            remarks: payload.remarks,
          }
        );
      } else {
        await api.post('/attendance', payload);
      }

      alert('Attendance created successfully');

      setShowAttendanceModal(false);

      setAttendanceForm({
        employeeId: '',
        date: selectedDate,
        status: 'PRESENT',
        checkIn: '',
        checkOut: '',
        workingHours: '',
        remarks: '',
      });

      await loadData();
    } catch (error: any) {
      console.error('Failed to save attendance:', error);
      alert(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          'Failed to save attendance'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateLeave = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (
      leaveForm.startDate > leaveForm.endDate
    ) {
      alert('End date cannot be before start date');
      return;
    }

    try {
      setActionLoading(true);

      await api.post('/attendance/leaves', {
        employeeId:
          leaveForm.employeeId || undefined,
        branchId,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason || null,
        remarks: leaveForm.remarks || null,
      });

      alert('Leave request submitted');

      setShowLeaveModal(false);

      setLeaveForm({
        employeeId: '',
        startDate: todayString(),
        endDate: todayString(),
        reason: '',
        remarks: '',
      });

      await loadData();
    } catch (error: any) {
      alert(
        error?.response?.data?.message ||
          'Failed to submit leave'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveStatus = async (
    id: string,
    status: LeaveStatus
  ) => {
    const message =
      status === 'APPROVED'
        ? 'Approve this leave request?'
        : status === 'REJECTED'
        ? 'Reject this leave request?'
        : 'Cancel this leave request?';

    if (!window.confirm(message)) return;

    try {
      setActionLoading(true);

      await api.patch(
        `/attendance/leaves/${id}/status`,
        {
          status,
        }
      );

      await loadData();
    } catch (error: any) {
      alert(
        error?.response?.data?.message ||
          'Failed to update leave'
      );
    } finally {
      setActionLoading(false);
    }
  };

  if (!employee) {
    return null;
  }

  return (
    <div className="attendance-page">
      <style>{`
        .attendance-page {
          padding: 24px;
          max-width: 1600px;
          margin: 0 auto;
        }

        .attendance-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 24px;
        }

        .attendance-title h1 {
          margin: 0 0 6px;
          font-size: 28px;
          font-weight: 700;
        }

        .attendance-title p {
          margin: 0;
          color: #64748b;
        }

        .attendance-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .attendance-btn {
          border: 0;
          border-radius: 8px;
          padding: 10px 16px;
          cursor: pointer;
          font-weight: 600;
          transition: 0.2s;
        }

        .attendance-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .attendance-btn.primary {
          background: #2563eb;
          color: white;
        }

        .attendance-btn.success {
          background: #16a34a;
          color: white;
        }

        .attendance-btn.danger {
          background: #dc2626;
          color: white;
        }

        .attendance-btn.secondary {
          background: #e2e8f0;
          color: #0f172a;
        }

        .attendance-stats {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }

        .attendance-stat {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }

        .attendance-stat-label {
          color: #64748b;
          font-size: 13px;
          margin-bottom: 8px;
        }

        .attendance-stat-value {
          font-size: 28px;
          font-weight: 700;
        }

        .attendance-toolbar {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 18px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .attendance-input,
        .attendance-select {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 12px;
          background: white;
          color: #0f172a;
        }

        .attendance-search {
          min-width: 240px;
          flex: 1;
        }

        .attendance-tabs {
          display: flex;
          gap: 4px;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 9px;
          margin-bottom: 18px;
          width: fit-content;
        }

        .attendance-tab {
          border: 0;
          background: transparent;
          padding: 10px 18px;
          border-radius: 7px;
          cursor: pointer;
          font-weight: 600;
        }

        .attendance-tab.active {
          background: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .attendance-table-wrap {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow-x: auto;
        }

        .attendance-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 900px;
        }

        .attendance-table th,
        .attendance-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          white-space: nowrap;
        }

        .attendance-table th {
          background: #f8fafc;
          font-size: 12px;
          text-transform: uppercase;
          color: #64748b;
        }

        .employee-name {
          font-weight: 600;
        }

        .employee-meta {
          font-size: 12px;
          color: #64748b;
          margin-top: 3px;
        }

        .attendance-status,
        .leave-status {
          display: inline-flex;
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }

        .attendance-status.present,
        .leave-status.approved {
          background: #dcfce7;
          color: #166534;
        }

        .attendance-status.absent,
        .leave-status.rejected {
          background: #fee2e2;
          color: #991b1b;
        }

        .attendance-status.late,
        .leave-status.pending {
          background: #fef3c7;
          color: #92400e;
        }

        .attendance-status.half-day {
          background: #dbeafe;
          color: #1e40af;
        }

        .attendance-status.leave {
          background: #ede9fe;
          color: #6b21a8;
        }

        .leave-status.cancelled {
          background: #e2e8f0;
          color: #475569;
        }

        .table-actions {
          display: flex;
          gap: 6px;
        }

        .small-btn {
          border: 0;
          border-radius: 6px;
          padding: 7px 10px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }

        .small-btn.approve {
          background: #dcfce7;
          color: #166534;
        }

        .small-btn.reject {
          background: #fee2e2;
          color: #991b1b;
        }

        .small-btn.cancel {
          background: #e2e8f0;
          color: #334155;
        }

        .attendance-empty {
          padding: 60px 20px;
          text-align: center;
          color: #64748b;
        }

        .attendance-warning {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #9a3412;
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 18px;
        }

        .attendance-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15,23,42,0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 1000;
        }

        .attendance-modal {
          width: 100%;
          max-width: 620px;
          max-height: 90vh;
          overflow-y: auto;
          background: white;
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.2);
        }

        .attendance-modal h2 {
          margin-top: 0;
        }

        .attendance-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .attendance-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .attendance-form-group.full {
          grid-column: 1 / -1;
        }

        .attendance-form-group label {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }

        .attendance-form-group textarea {
          min-height: 90px;
          resize: vertical;
        }

        .attendance-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }

        @media (max-width: 1100px) {
          .attendance-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 700px) {
          .attendance-page {
            padding: 14px;
          }

          .attendance-header {
            flex-direction: column;
          }

          .attendance-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .attendance-form-grid {
            grid-template-columns: 1fr;
          }

          .attendance-form-group.full {
            grid-column: auto;
          }

          .attendance-search {
            min-width: 100%;
          }
        }
      `}</style>

      <div className="attendance-header">
        <div className="attendance-title">
          <h1>Attendance & Leave</h1>
          <p>
            Manage employee attendance, working hours and leave requests.
          </p>
        </div>

        <div className="attendance-actions">
          <button
            className="attendance-btn success"
            onClick={handleCheckIn}
            disabled={actionLoading || !branchId}
          >
            ✓ Check In
          </button>

          <button
            className="attendance-btn danger"
            onClick={handleCheckOut}
            disabled={actionLoading || !branchId}
          >
            ↪ Check Out
          </button>

          {isManager && (
            <button
              className="attendance-btn primary"
              onClick={() => setShowAttendanceModal(true)}
              disabled={!branchId}
            >
              + Attendance
            </button>
          )}

          <button
            className="attendance-btn secondary"
            onClick={() => setShowLeaveModal(true)}
            disabled={!branchId}
          >
            + Leave Request
          </button>
        </div>
      </div>

      {!branchId && (
        <div className="attendance-warning">
          Please select a branch before using Attendance.
        </div>
      )}

      {employee.role === 'SUPER_ADMIN' &&
        branches.length > 0 && (
          <div className="attendance-toolbar">
            <select
              className="attendance-select"
              value={selectedBranchId}
              onChange={(event) => {
                const value = event.target.value;

                setSelectedBranchId(value);

                localStorage.setItem(
                  'selected_branch_id',
                  value
                );

                window.dispatchEvent(
                  new CustomEvent('branchChanged', {
                    detail: {
                      branchId: value,
                    },
                  })
                );
              }}
            >
              <option value="">Select Branch</option>

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

      <div className="attendance-stats">
        <div className="attendance-stat">
          <div className="attendance-stat-label">
            Present
          </div>
          <div className="attendance-stat-value">
            {stats.present}
          </div>
        </div>

        <div className="attendance-stat">
          <div className="attendance-stat-label">
            Absent
          </div>
          <div className="attendance-stat-value">
            {stats.absent}
          </div>
        </div>

        <div className="attendance-stat">
          <div className="attendance-stat-label">
            Late
          </div>
          <div className="attendance-stat-value">
            {stats.late}
          </div>
        </div>

        <div className="attendance-stat">
          <div className="attendance-stat-label">
            Half Day
          </div>
          <div className="attendance-stat-value">
            {stats.halfDay}
          </div>
        </div>

        <div className="attendance-stat">
          <div className="attendance-stat-label">
            Leave
          </div>
          <div className="attendance-stat-value">
            {stats.leave}
          </div>
        </div>
      </div>

      <div className="attendance-tabs">
        <button
          className={`attendance-tab ${
            activeTab === 'attendance' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('attendance')}
        >
          Attendance
        </button>

        <button
          className={`attendance-tab ${
            activeTab === 'leaves' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('leaves')}
        >
          Leave Requests
        </button>
      </div>

      {activeTab === 'attendance' && (
        <>
          <div className="attendance-toolbar">
            <input
              className="attendance-input attendance-search"
              placeholder="Search employee..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />

            <input
              className="attendance-input"
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(event.target.value)
              }
            />

            <select
              className="attendance-select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | AttendanceStatus
                    | 'ALL'
                )
              }
            >
              <option value="ALL">
                All Statuses
              </option>

              {Object.entries(STATUS_LABELS).map(
                ([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                )
              )}
            </select>

            <button
              className="attendance-btn secondary"
              onClick={loadData}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </div>

          <div className="attendance-table-wrap">
            {loading ? (
              <div className="attendance-empty">
                Loading attendance...
              </div>
            ) : filteredAttendance.length === 0 ? (
              <div className="attendance-empty">
                No attendance records found.
              </div>
            ) : (
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Hours</th>
                    <th>Remarks</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredAttendance.map(
                    (record) => (
                      <tr key={record.id}>
                        <td>
                          <div className="employee-name">
                            {record.employee?.fullName ||
                              'Unknown Employee'}
                          </div>

                          <div className="employee-meta">
                            {record.employee?.department ||
                              record.employee?.role ||
                              ''}
                          </div>
                        </td>

                        <td>
                          {formatDate(record.date)}
                        </td>

                        <td>
                          <span
                            className={getStatusClass(
                              record.status
                            )}
                          >
                            {STATUS_LABELS[
                              record.status
                            ]}
                          </span>
                        </td>

                        <td>
                          {formatTime(record.checkIn)}
                        </td>

                        <td>
                          {formatTime(record.checkOut)}
                        </td>

                        <td>
                          {record.workingHours !== null &&
                          record.workingHours !== undefined
                            ? `${record.workingHours} h`
                            : '-'}
                        </td>

                        <td>
                          {record.remarks || '-'}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'leaves' && (
        <>
          <div className="attendance-toolbar">
            <input
              className="attendance-input attendance-search"
              placeholder="Search leave requests..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />

            <select
              className="attendance-select"
              value={leaveStatusFilter}
              onChange={(event) =>
                setLeaveStatusFilter(
                  event.target.value as
                    | LeaveStatus
                    | 'ALL'
                )
              }
            >
              <option value="ALL">
                All Leave Statuses
              </option>

              {Object.entries(
                LEAVE_STATUS_LABELS
              ).map(([value, label]) => (
                <option
                  key={value}
                  value={value}
                >
                  {label}
                </option>
              ))}
            </select>

            <button
              className="attendance-btn secondary"
              onClick={loadData}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </div>

          <div className="attendance-table-wrap">
            {loading ? (
              <div className="attendance-empty">
                Loading leave requests...
              </div>
            ) : filteredLeaves.length === 0 ? (
              <div className="attendance-empty">
                No leave requests found.
              </div>
            ) : (
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Status</th>
                    <th>Reason</th>
                    {isManager && (
                      <th>Actions</th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filteredLeaves.map((leave) => (
                    <tr key={leave.id}>
                      <td>
                        <div className="employee-name">
                          {leave.employee?.fullName ||
                            'Unknown Employee'}
                        </div>

                        <div className="employee-meta">
                          {leave.employee?.department ||
                            leave.employee?.role ||
                            ''}
                        </div>
                      </td>

                      <td>
                        {formatDate(
                          leave.startDate
                        )}
                      </td>

                      <td>
                        {formatDate(
                          leave.endDate
                        )}
                      </td>

                      <td>
                        <span
                          className={getLeaveStatusClass(
                            leave.status
                          )}
                        >
                          {
                            LEAVE_STATUS_LABELS[
                              leave.status
                            ]
                          }
                        </span>
                      </td>

                      <td>
                        {leave.reason || '-'}
                      </td>

                      {isManager && (
                        <td>
                          {leave.status ===
                            'PENDING' && (
                            <div className="table-actions">
                              <button
                                className="small-btn approve"
                                onClick={() =>
                                  handleLeaveStatus(
                                    leave.id,
                                    'APPROVED'
                                  )
                                }
                                disabled={actionLoading}
                              >
                                Approve
                              </button>

                              <button
                                className="small-btn reject"
                                onClick={() =>
                                  handleLeaveStatus(
                                    leave.id,
                                    'REJECTED'
                                  )
                                }
                                disabled={actionLoading}
                              >
                                Reject
                              </button>
                            </div>
                          )}

                          {leave.status ===
                            'APPROVED' && (
                            <button
                              className="small-btn cancel"
                              onClick={() =>
                                handleLeaveStatus(
                                  leave.id,
                                  'CANCELLED'
                                )
                              }
                              disabled={actionLoading}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {showAttendanceModal && (
        <div
          className="attendance-modal-overlay"
          onClick={() =>
            setShowAttendanceModal(false)
          }
        >
          <div
            className="attendance-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <h2>Manual Attendance</h2>

            <form
              onSubmit={handleCreateAttendance}
            >
              <div className="attendance-form-grid">
                <div className="attendance-form-group full">
                  <label>Employee</label>

                  <select
                    className="attendance-select"
                    value={
                      attendanceForm.employeeId
                    }
                    onChange={(event) =>
                      setAttendanceForm({
                        ...attendanceForm,
                        employeeId:
                          event.target.value,
                      })
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
                          {item.fullName} —{' '}
                          {item.loginId}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="attendance-form-group">
                  <label>Date</label>

                  <input
                    className="attendance-input"
                    type="date"
                    value={
                      attendanceForm.date
                    }
                    onChange={(event) =>
                      setAttendanceForm({
                        ...attendanceForm,
                        date:
                          event.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="attendance-form-group">
                  <label>Status</label>

                  <select
                    className="attendance-select"
                    value={
                      attendanceForm.status
                    }
                    onChange={(event) =>
                      setAttendanceForm({
                        ...attendanceForm,
                        status:
                          event.target.value as AttendanceStatus,
                      })
                    }
                  >
                    {Object.entries(
                      STATUS_LABELS
                    ).map(
                      ([value, label]) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="attendance-form-group">
                  <label>
                    Check In
                  </label>

                  <input
                    className="attendance-input"
                    type="time"
                    value={
                      attendanceForm.checkIn
                    }
                    onChange={(event) =>
                      setAttendanceForm({
                        ...attendanceForm,
                        checkIn:
                          event.target.value,
                      })
                    }
                  />
                </div>

                <div className="attendance-form-group">
                  <label>
                    Check Out
                  </label>

                  <input
                    className="attendance-input"
                    type="time"
                    value={
                      attendanceForm.checkOut
                    }
                    onChange={(event) =>
                      setAttendanceForm({
                        ...attendanceForm,
                        checkOut:
                          event.target.value,
                      })
                    }
                  />
                </div>

                <div className="attendance-form-group">
                  <label>
                    Working Hours
                  </label>

                  <input
                    className="attendance-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 8"
                    value={
                      attendanceForm.workingHours
                    }
                    onChange={(event) =>
                      setAttendanceForm({
                        ...attendanceForm,
                        workingHours:
                          event.target.value,
                      })
                    }
                  />
                </div>

                <div className="attendance-form-group full">
                  <label>Remarks</label>

                  <textarea
                    className="attendance-input"
                    value={
                      attendanceForm.remarks
                    }
                    onChange={(event) =>
                      setAttendanceForm({
                        ...attendanceForm,
                        remarks:
                          event.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="attendance-modal-actions">
                <button
                  type="button"
                  className="attendance-btn secondary"
                  onClick={() =>
                    setShowAttendanceModal(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="attendance-btn primary"
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? 'Saving...'
                    : 'Save Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLeaveModal && (
        <div
          className="attendance-modal-overlay"
          onClick={() =>
            setShowLeaveModal(false)
          }
        >
          <div
            className="attendance-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <h2>Leave Request</h2>

            <form
              onSubmit={handleCreateLeave}
            >
              <div className="attendance-form-grid">
                {isManager && (
                  <div className="attendance-form-group full">
                    <label>
                      Employee
                    </label>

                    <select
                      className="attendance-select"
                      value={
                        leaveForm.employeeId
                      }
                      onChange={(event) =>
                        setLeaveForm({
                          ...leaveForm,
                          employeeId:
                            event.target.value,
                        })
                      }
                    >
                      <option value="">
                        My Leave
                      </option>

                      {employees.map(
                        (item) => (
                          <option
                            key={item.id}
                            value={item.id}
                          >
                            {item.fullName} —{' '}
                            {item.loginId}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                )}

                <div className="attendance-form-group">
                  <label>
                    Start Date
                  </label>

                  <input
                    className="attendance-input"
                    type="date"
                    value={
                      leaveForm.startDate
                    }
                    onChange={(event) =>
                      setLeaveForm({
                        ...leaveForm,
                        startDate:
                          event.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="attendance-form-group">
                  <label>
                    End Date
                  </label>

                  <input
                    className="attendance-input"
                    type="date"
                    value={
                      leaveForm.endDate
                    }
                    onChange={(event) =>
                      setLeaveForm({
                        ...leaveForm,
                        endDate:
                          event.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="attendance-form-group full">
                  <label>
                    Reason
                  </label>

                  <textarea
                    className="attendance-input"
                    placeholder="Reason for leave"
                    value={
                      leaveForm.reason
                    }
                    onChange={(event) =>
                      setLeaveForm({
                        ...leaveForm,
                        reason:
                          event.target.value,
                      })
                    }
                  />
                </div>

                <div className="attendance-form-group full">
                  <label>
                    Remarks
                  </label>

                  <textarea
                    className="attendance-input"
                    value={
                      leaveForm.remarks
                    }
                    onChange={(event) =>
                      setLeaveForm({
                        ...leaveForm,
                        remarks:
                          event.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="attendance-modal-actions">
                <button
                  type="button"
                  className="attendance-btn secondary"
                  onClick={() =>
                    setShowLeaveModal(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="attendance-btn primary"
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? 'Submitting...'
                    : 'Submit Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}