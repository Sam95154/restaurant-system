import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE';
type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

type DraftStatus = AttendanceStatus | '';

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
}

interface Employee {
  id: string;
  fullName: string;
  loginId: string;
  role: string;
  department?: string | null;
  branchId?: string | null;
  status?: string;
}

interface Branch {
  id: string;
  name: string;
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
  };
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

const todayString = () => new Date().toISOString().slice(0, 10);

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const formatTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  });
};

const getStatusClass = (status: AttendanceStatus) => `attendance-status ${status.toLowerCase().replace('_', '-')}`;
const getLeaveStatusClass = (status: LeaveStatus) => `leave-status ${status.toLowerCase()}`;

export default function Attendance() {
  const { employee } = useAuth();
  const isManagement = employee?.role === 'SUPER_ADMIN' || employee?.role === 'MANAGER';
  const isSuperAdmin = employee?.role === 'SUPER_ADMIN';

  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);

  const [selectedBranchId, setSelectedBranchId] = useState(() =>
    employee?.role === 'SUPER_ADMIN'
      ? localStorage.getItem('selected_branch_id') || ''
      : employee?.branchId || ''
  );
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'attendance' | 'leaves'>('attendance');
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<LeaveStatus | 'ALL'>('ALL');

  // One draft status per employee for the selected branch/date.
  const [draftStatus, setDraftStatus] = useState<Record<string, DraftStatus>>({});
  const [draftRemarks, setDraftRemarks] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  const [leaveForm, setLeaveForm] = useState({
    employeeId: '',
    startDate: todayString(),
    endDate: todayString(),
    reason: '',
    remarks: '',
  });

  const branchId = isSuperAdmin ? selectedBranchId : employee?.branchId || '';

  useEffect(() => {
    if (employee?.role !== 'SUPER_ADMIN' && employee?.branchId) {
      setSelectedBranchId(employee.branchId);
    }
  }, [employee?.role, employee?.branchId]);

  useEffect(() => {
    if (!employee) return;

    const loadBranches = async () => {
      if (!isSuperAdmin) return;
      try {
        const response = await api.get('/branches');
        setBranches(Array.isArray(response.data) ? response.data : response.data?.branches || []);
      } catch (error) {
        console.error('Failed to load branches:', error);
        setBranches([]);
      }
    };

    loadBranches();
  }, [employee, isSuperAdmin]);

  useEffect(() => {
    if (!employee || !branchId) {
      setEmployees([]);
      setAttendance([]);
      setLeaves([]);
      setDraftStatus({});
      setDraftRemarks({});
      setLoading(false);
      return;
    }

    loadData();
  }, [employee?.id, employee?.role, branchId, selectedDate, leaveStatusFilter]);

  const loadData = async () => {
    if (!branchId) return;

    try {
      setLoading(true);

      const attendancePromise = api.get('/attendance', {
        params: { branchId, date: selectedDate },
      });
      const leavePromise = api.get('/attendance/leaves/list', {
        params: { branchId, ...(leaveStatusFilter !== 'ALL' ? { status: leaveStatusFilter } : {}) },
      });
      const employeePromise = isManagement
        ? api.get('/employees', { params: { branchId } })
        : Promise.resolve({ data: [] });

      const [employeeResponse, attendanceResponse, leaveResponse] = await Promise.all([
        employeePromise,
        attendancePromise,
        leavePromise,
      ]);

      const employeeList: Employee[] = Array.isArray(employeeResponse.data)
        ? employeeResponse.data
        : employeeResponse.data?.employees || [];
      const attendanceList: AttendanceRecord[] = Array.isArray(attendanceResponse.data)
        ? attendanceResponse.data
        : attendanceResponse.data?.attendance || [];
      const leaveList: LeaveRecord[] = Array.isArray(leaveResponse.data)
        ? leaveResponse.data
        : leaveResponse.data?.leaves || [];

      setEmployees(isManagement
        ? employeeList.filter((item) => item.branchId === branchId || !item.branchId)
        : []
      );
      setAttendance(attendanceList);
      setLeaves(leaveList);

      const nextStatus: Record<string, DraftStatus> = {};
      const nextRemarks: Record<string, string> = {};
      attendanceList.forEach((record) => {
        nextStatus[record.employeeId] = record.status;
        nextRemarks[record.employeeId] = record.remarks || '';
      });
      setDraftStatus(nextStatus);
      setDraftRemarks(nextRemarks);
    } catch (error: any) {
      console.error('Failed to load attendance data:', error);
      alert(error?.response?.data?.message || 'Failed to load attendance data');
      setEmployees([]);
      setAttendance([]);
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((item) =>
      item.fullName.toLowerCase().includes(query) ||
      item.loginId.toLowerCase().includes(query) ||
      item.department?.toLowerCase().includes(query) ||
      item.role.toLowerCase().includes(query)
    );
  }, [employees, search]);

  const filteredLeaves = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return leaves;
    return leaves.filter((leave) =>
      leave.employee?.fullName?.toLowerCase().includes(query) ||
      leave.employee?.loginId?.toLowerCase().includes(query) ||
      leave.reason?.toLowerCase().includes(query)
    );
  }, [leaves, search]);

  const stats = useMemo(() => {
    const values = Object.values(draftStatus);
    return {
      present: values.filter((value) => value === 'PRESENT').length,
      absent: values.filter((value) => value === 'ABSENT').length,
      late: values.filter((value) => value === 'LATE').length,
      halfDay: values.filter((value) => value === 'HALF_DAY').length,
      leave: values.filter((value) => value === 'LEAVE').length,
      unmarked: employees.filter((item) => !draftStatus[item.id]).length,
    };
  }, [draftStatus, employees]);

  const setStatus = (employeeId: string, status: AttendanceStatus) => {
    setDraftStatus((current) => ({ ...current, [employeeId]: status }));
  };

  const markAll = (status: AttendanceStatus) => {
    const next: Record<string, DraftStatus> = {};
    employees.forEach((item) => { next[item.id] = status; });
    setDraftStatus(next);
  };

  const saveAttendance = async () => {
    if (!branchId) {
      alert('Please select a branch first.');
      return;
    }

    const unmarked = employees.filter((item) => !draftStatus[item.id]);
    if (unmarked.length > 0) {
      alert(`Please mark attendance for all employees. ${unmarked.length} employee(s) are still unmarked.`);
      return;
    }

    if (employees.length === 0) {
      alert('No employees found for this branch.');
      return;
    }

    try {
      setSavingAttendance(true);

      const existingByEmployee = new Map(attendance.map((record) => [record.employeeId, record]));

      for (const item of employees) {
        const status = draftStatus[item.id] as AttendanceStatus;
        const existing = existingByEmployee.get(item.id);
        const remarks = draftRemarks[item.id]?.trim() || null;

        if (existing) {
          await api.put(`/attendance/${existing.id}`, {
            status,
            remarks,
          });
        } else {
          await api.post('/attendance', {
            employeeId: item.id,
            branchId,
            date: selectedDate,
            status,
            remarks,
          });
        }
      }

      alert(`Attendance saved successfully for ${employees.length} employee(s).`);
      await loadData();
    } catch (error: any) {
      console.error('Failed to save attendance:', error);
      alert(error?.response?.data?.message || 'Failed to save attendance.');
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleCheckIn = async () => {
    try {
      setActionLoading(true);
      await api.post('/attendance/check-in', { branchId, date: selectedDate });
      alert('Check-in successful');
      await loadData();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionLoading(true);
      await api.post('/attendance/check-out', { date: selectedDate });
      alert('Check-out successful');
      await loadData();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateLeave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (leaveForm.startDate > leaveForm.endDate) {
      alert('End date cannot be before start date');
      return;
    }

    try {
      setActionLoading(true);
      await api.post('/attendance/leaves', {
        employeeId: leaveForm.employeeId || undefined,
        branchId,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason || null,
        remarks: leaveForm.remarks || null,
      });
      alert('Leave request submitted');
      setShowLeaveModal(false);
      setLeaveForm({ employeeId: '', startDate: todayString(), endDate: todayString(), reason: '', remarks: '' });
      await loadData();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to submit leave');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveStatus = async (id: string, status: LeaveStatus) => {
    if (!window.confirm(`${status === 'APPROVED' ? 'Approve' : status === 'REJECTED' ? 'Reject' : 'Cancel'} this leave request?`)) return;
    try {
      setActionLoading(true);
      await api.patch(`/attendance/leaves/${id}/status`, { status });
      await loadData();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to update leave');
    } finally {
      setActionLoading(false);
    }
  };

  if (!employee) return null;

  return (
    <div className="attendance-page">
      <style>{`
        .attendance-page{padding:24px;max-width:1600px;margin:0 auto;color:#0f172a}
        .attendance-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:20px}
        .attendance-title h1{margin:0 0 6px;font-size:28px}.attendance-title p{margin:0;color:#64748b}
        .attendance-actions{display:flex;gap:8px;flex-wrap:wrap}.attendance-btn{border:0;border-radius:8px;padding:10px 14px;cursor:pointer;font-weight:600}.attendance-btn:disabled{opacity:.55;cursor:not-allowed}
        .primary{background:#2563eb;color:white}.success{background:#16a34a;color:white}.danger{background:#dc2626;color:white}.secondary{background:#e2e8f0;color:#0f172a}
        .branch-bar{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
        .branch-label{font-weight:700}.attendance-input,.attendance-select{border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:white;color:#0f172a}.search{min-width:240px;flex:1}
        .stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:18px}.stat{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:15px}.stat-label{font-size:12px;color:#64748b;margin-bottom:6px}.stat-value{font-size:25px;font-weight:800}
        .tabs{display:flex;gap:4px;background:#f1f5f9;padding:4px;border-radius:9px;margin-bottom:18px;width:max-content}.tab{border:0;background:transparent;padding:10px 18px;border-radius:7px;cursor:pointer;font-weight:700}.tab.active{background:white;box-shadow:0 1px 3px rgba(0,0,0,.08)}
        .bulk-bar{background:#fff;border:1px solid #dbeafe;border-radius:12px;padding:14px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.bulk-left{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bulk-title{font-weight:800}.bulk-note{color:#64748b;font-size:13px}
        .attendance-table-wrap{background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:auto}.attendance-table{width:100%;border-collapse:collapse;min-width:1050px}.attendance-table th,.attendance-table td{padding:13px 14px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:middle}.attendance-table th{background:#f8fafc;color:#64748b;font-size:12px;text-transform:uppercase}.employee-name{font-weight:700}.employee-meta{font-size:12px;color:#64748b;margin-top:3px}
        .status-group{display:flex;gap:6px;flex-wrap:wrap}.status-option{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:7px 9px;cursor:pointer;font-size:12px;font-weight:700}.status-option.selected{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.status-option.present.selected{border-color:#16a34a;background:#f0fdf4;color:#166534}.status-option.absent.selected{border-color:#dc2626;background:#fef2f2;color:#991b1b}.status-option.late.selected{border-color:#d97706;background:#fffbeb;color:#92400e}.status-option.half.selected{border-color:#2563eb;background:#eff6ff;color:#1e40af}.status-option.leave.selected{border-color:#7c3aed;background:#f5f3ff;color:#6b21a8}
        .remarks-input{width:180px}.empty{padding:55px 20px;text-align:center;color:#64748b}.warning{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:10px;padding:14px;margin-bottom:18px}
        .attendance-status,.leave-status{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:700}.attendance-status.present,.leave-status.approved{background:#dcfce7;color:#166534}.attendance-status.absent,.leave-status.rejected{background:#fee2e2;color:#991b1b}.attendance-status.late,.leave-status.pending{background:#fef3c7;color:#92400e}.attendance-status.half-day{background:#dbeafe;color:#1e40af}.attendance-status.leave{background:#ede9fe;color:#6b21a8}.leave-status.cancelled{background:#e2e8f0;color:#475569}
        .small-actions{display:flex;gap:6px}.small-btn{border:0;border-radius:6px;padding:7px 10px;cursor:pointer;font-size:12px;font-weight:700}.approve{background:#dcfce7;color:#166534}.reject{background:#fee2e2;color:#991b1b}.cancel{background:#e2e8f0;color:#334155}
        .modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}.modal{width:100%;max-width:620px;max-height:90vh;overflow:auto;background:white;border-radius:14px;padding:24px}.modal h2{margin-top:0}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-group{display:flex;flex-direction:column;gap:6px}.form-group.full{grid-column:1/-1}.form-group label{font-size:13px;font-weight:700}.form-group textarea{min-height:90px;resize:vertical}.modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
        @media(max-width:1200px){.stats{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:700px){.attendance-page{padding:14px}.attendance-header{flex-direction:column}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.form-grid{grid-template-columns:1fr}.form-group.full{grid-column:auto}.search{min-width:100%}}
      `}</style>

      <div className="attendance-header">
        <div className="attendance-title">
          <h1>Attendance & Leave</h1>
          <p>Mark daily attendance for the selected branch and manage leave requests.</p>
        </div>
        <div className="attendance-actions">
          <button className="attendance-btn success" onClick={handleCheckIn} disabled={actionLoading || !branchId}>✓ My Check In</button>
          <button className="attendance-btn danger" onClick={handleCheckOut} disabled={actionLoading || !branchId}>↪ My Check Out</button>
          <button className="attendance-btn secondary" onClick={() => setShowLeaveModal(true)} disabled={!branchId}>+ Leave Request</button>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="branch-bar">
          <span className="branch-label">Branch</span>
          <select className="attendance-select" value={selectedBranchId} onChange={(event) => {
            const value = event.target.value;
            setSelectedBranchId(value);
            localStorage.setItem('selected_branch_id', value);
            window.dispatchEvent(new CustomEvent('branchChanged', { detail: { branchId: value } }));
          }}>
            <option value="">Select Branch</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <span className="bulk-note">Super Admin can mark attendance for any selected branch.</span>
        </div>
      )}

      {!branchId && <div className="warning">{isSuperAdmin ? 'Select a branch to load its employees.' : 'Your account is not assigned to a branch.'}</div>}

      {branchId && isManagement && (
        <>
          <div className="branch-bar">
            <span className="branch-label">Attendance date</span>
            <input className="attendance-input" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            <span className="bulk-note">{isSuperAdmin ? 'Selected branch employees are loaded automatically.' : 'Your branch employees are loaded automatically.'}</span>
          </div>

          <div className="stats">
            <div className="stat"><div className="stat-label">Present</div><div className="stat-value">{stats.present}</div></div>
            <div className="stat"><div className="stat-label">Absent</div><div className="stat-value">{stats.absent}</div></div>
            <div className="stat"><div className="stat-label">Late</div><div className="stat-value">{stats.late}</div></div>
            <div className="stat"><div className="stat-label">Half Day</div><div className="stat-value">{stats.halfDay}</div></div>
            <div className="stat"><div className="stat-label">Leave</div><div className="stat-value">{stats.leave}</div></div>
            <div className="stat"><div className="stat-label">Unmarked</div><div className="stat-value">{stats.unmarked}</div></div>
          </div>
        </>
      )}

      <div className="tabs">
        <button className={`tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>Daily Attendance</button>
        <button className={`tab ${activeTab === 'leaves' ? 'active' : ''}`} onClick={() => setActiveTab('leaves')}>Leave Requests</button>
      </div>

      {activeTab === 'attendance' && isManagement && branchId && (
        <>
          <div className="bulk-bar">
            <div className="bulk-left">
              <span className="bulk-title">Mark Attendance</span>
              <button className="attendance-btn success" onClick={() => markAll('PRESENT')} disabled={savingAttendance || employees.length === 0}>Mark All Present</button>
              <button className="attendance-btn danger" onClick={() => markAll('ABSENT')} disabled={savingAttendance || employees.length === 0}>Mark All Absent</button>
            </div>
            <div className="bulk-left">
              <span className="bulk-note">{employees.length} employee(s) • {selectedDate}</span>
              <button className="attendance-btn secondary" onClick={loadData} disabled={loading || savingAttendance}>↻ Refresh</button>
              <button className="attendance-btn primary" onClick={saveAttendance} disabled={savingAttendance || loading || employees.length === 0}>{savingAttendance ? 'Saving...' : 'Mark Attendance'}</button>
            </div>
          </div>

          <div className="branch-bar">
            <input className="attendance-input search" placeholder="Search employee..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          <div className="attendance-table-wrap">
            {loading ? <div className="empty">Loading employees and attendance...</div> : filteredEmployees.length === 0 ? <div className="empty">No employees found for this branch.</div> : (
              <table className="attendance-table">
                <thead><tr><th>Employee ID</th><th>Name</th><th>Department / Role</th><th>Attendance</th><th>Remarks</th></tr></thead>
                <tbody>
                  {filteredEmployees.map((item) => {
                    const current = draftStatus[item.id] || '';
                    return (
                      <tr key={item.id}>
                        <td>{item.loginId}</td>
                        <td><div className="employee-name">{item.fullName}</div><div className="employee-meta">{item.role}</div></td>
                        <td>{item.department || item.role || '-'}</td>
                        <td>
                          <div className="status-group">
                            {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((status) => (
                              <button key={status} type="button" className={`status-option ${status === 'PRESENT' ? 'present' : status === 'ABSENT' ? 'absent' : status === 'LATE' ? 'late' : status === 'HALF_DAY' ? 'half' : 'leave'} ${current === status ? 'selected' : ''}`} onClick={() => setStatus(item.id, status)}>{STATUS_LABELS[status]}</button>
                            ))}
                          </div>
                        </td>
                        <td><input className="attendance-input remarks-input" placeholder="Optional" value={draftRemarks[item.id] || ''} onChange={(event) => setDraftRemarks((currentRemarks) => ({ ...currentRemarks, [item.id]: event.target.value }))} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'attendance' && !isManagement && (
        <div className="attendance-table-wrap">
          <div className="empty">You can view your own attendance here. Attendance for other employees is managed by the branch manager or Super Admin.</div>
          <div style={{overflowX:'auto'}}>
            <table className="attendance-table"><thead><tr><th>Date</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Remarks</th></tr></thead><tbody>
              {attendance.map((record) => <tr key={record.id}><td>{formatDate(record.date)}</td><td><span className={getStatusClass(record.status)}>{STATUS_LABELS[record.status]}</span></td><td>{formatTime(record.checkIn)}</td><td>{formatTime(record.checkOut)}</td><td>{record.workingHours ?? '-'}</td><td>{record.remarks || '-'}</td></tr>)}
            </tbody></table>
          </div>
        </div>
      )}

      {activeTab === 'leaves' && (
        <>
          <div className="branch-bar">
            <input className="attendance-input search" placeholder="Search leave requests..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <select className="attendance-select" value={leaveStatusFilter} onChange={(event) => setLeaveStatusFilter(event.target.value as LeaveStatus | 'ALL')}>
              <option value="ALL">All Leave Statuses</option>
              {(Object.entries(LEAVE_STATUS_LABELS) as [LeaveStatus, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="attendance-btn secondary" onClick={loadData} disabled={loading}>↻ Refresh</button>
          </div>
          <div className="attendance-table-wrap">
            {loading ? <div className="empty">Loading leave requests...</div> : filteredLeaves.length === 0 ? <div className="empty">No leave requests found.</div> : (
              <table className="attendance-table"><thead><tr><th>Employee</th><th>Start Date</th><th>End Date</th><th>Status</th><th>Reason</th>{isManagement && <th>Actions</th>}</tr></thead><tbody>
                {filteredLeaves.map((leave) => <tr key={leave.id}><td><div className="employee-name">{leave.employee?.fullName || 'Unknown Employee'}</div><div className="employee-meta">{leave.employee?.department || leave.employee?.role || ''}</div></td><td>{formatDate(leave.startDate)}</td><td>{formatDate(leave.endDate)}</td><td><span className={getLeaveStatusClass(leave.status)}>{LEAVE_STATUS_LABELS[leave.status]}</span></td><td>{leave.reason || '-'}</td>{isManagement && <td>{leave.status === 'PENDING' && <div className="small-actions"><button className="small-btn approve" onClick={() => handleLeaveStatus(leave.id, 'APPROVED')} disabled={actionLoading}>Approve</button><button className="small-btn reject" onClick={() => handleLeaveStatus(leave.id, 'REJECTED')} disabled={actionLoading}>Reject</button></div>}{leave.status === 'APPROVED' && <button className="small-btn cancel" onClick={() => handleLeaveStatus(leave.id, 'CANCELLED')} disabled={actionLoading}>Cancel</button>}</td>}</tr>)}
              </tbody></table>
            )}
          </div>
        </>
      )}

      {showLeaveModal && (
        <div className="modal-overlay" onClick={() => setShowLeaveModal(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Leave Request</h2>
            <form onSubmit={handleCreateLeave}>
              <div className="form-grid">
                {isManagement && <div className="form-group full"><label>Employee</label><select className="attendance-select" value={leaveForm.employeeId} onChange={(event) => setLeaveForm({ ...leaveForm, employeeId: event.target.value })}><option value="">My Leave</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.fullName} — {item.loginId}</option>)}</select></div>}
                <div className="form-group"><label>Start Date</label><input className="attendance-input" type="date" value={leaveForm.startDate} onChange={(event) => setLeaveForm({ ...leaveForm, startDate: event.target.value })} required /></div>
                <div className="form-group"><label>End Date</label><input className="attendance-input" type="date" value={leaveForm.endDate} onChange={(event) => setLeaveForm({ ...leaveForm, endDate: event.target.value })} required /></div>
                <div className="form-group full"><label>Reason</label><textarea className="attendance-input" value={leaveForm.reason} onChange={(event) => setLeaveForm({ ...leaveForm, reason: event.target.value })} /></div>
                <div className="form-group full"><label>Remarks</label><textarea className="attendance-input" value={leaveForm.remarks} onChange={(event) => setLeaveForm({ ...leaveForm, remarks: event.target.value })} /></div>
              </div>
              <div className="modal-actions"><button type="button" className="attendance-btn secondary" onClick={() => setShowLeaveModal(false)}>Cancel</button><button type="submit" className="attendance-btn primary" disabled={actionLoading}>{actionLoading ? 'Submitting...' : 'Submit Leave'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
