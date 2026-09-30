import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'LEAVE';

interface Employee {
  id: string;
  fullName: string;
  loginId?: string;
  role?: string;
  department?: string | null;
  branchId?: string | null;
}

interface Branch {
  id: string;
  name: string;
}

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
}

const STATUS_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'LT',
  HALF_DAY: 'HD',
  LEAVE: 'L',
};

function getCurrentMonth(): string {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
}

function getMonthDates(month: string) {
  const [year, monthNumber] = month
    .split('-')
    .map(Number);

  if (!year || !monthNumber) {
    return [];
  }

  const daysInMonth = new Date(
    year,
    monthNumber,
    0
  ).getDate();

  return Array.from(
    { length: daysInMonth },
    (_, index) => {
      const day = index + 1;

      return {
        day,
        date: `${year}-${String(monthNumber).padStart(
          2,
          '0'
        )}-${String(day).padStart(2, '0')}`,
      };
    }
  );
}

function dateOnly(value: string): string {
  return value.substring(0, 10);
}

export default function AttendanceHistory() {
  const { employee } = useAuth();

  const [branches, setBranches] = useState<Branch[]>(
    []
  );

  const [employees, setEmployees] = useState<
    Employee[]
  >([]);

  const [attendance, setAttendance] = useState<
    AttendanceRecord[]
  >([]);

  const [selectedBranchId, setSelectedBranchId] =
    useState('');

  const [month, setMonth] =
    useState(getCurrentMonth());

  const [selectedEmployeeId, setSelectedEmployeeId] =
    useState('ALL');

  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const isSuperAdmin =
    employee?.role === 'SUPER_ADMIN';

  const branchId = isSuperAdmin
    ? selectedBranchId
    : employee?.branchId || '';

  const monthDates = useMemo(
    () => getMonthDates(month),
    [month]
  );

  useEffect(() => {
    if (!employee) {
      return;
    }

    if (isSuperAdmin) {
      void loadBranches();
    } else {
      setSelectedBranchId(
        employee.branchId || ''
      );
    }
  }, [
    employee?.id,
    employee?.role,
    employee?.branchId,
  ]);

  useEffect(() => {
    if (!branchId) {
      return;
    }

    void loadEmployees();
    void loadAttendance();
  }, [branchId, month]);

  async function loadBranches() {
    try {
      setError('');

      const response = await api.get('/branches');

      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.branches || [];

      setBranches(data);

      if (
        data.length > 0 &&
        !selectedBranchId
      ) {
        setSelectedBranchId(data[0].id);
      }
    } catch (err: any) {
      console.error(
        'Failed to load branches:',
        err
      );

      setError(
        err?.response?.data?.message ||
          'Failed to load branches.'
      );
    }
  }

  async function loadEmployees() {
    try {
      setError('');

      const response = await api.get(
        '/employees',
        {
          params: {
            branchId,
          },
        }
      );

      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.employees || [];

      setEmployees(data);
    } catch (err: any) {
      console.error(
        'Failed to load employees:',
        err
      );

      setEmployees([]);

      setError(
        err?.response?.data?.message ||
          'Failed to load employees.'
      );
    }
  }

  async function loadAttendance() {
    try {
      setLoading(true);
      setError('');

      const [year, monthNumber] =
        month.split('-').map(Number);

      const lastDay = new Date(
        year,
        monthNumber,
        0
      ).getDate();

      const startDate = `${year}-${String(
        monthNumber
      ).padStart(2, '0')}-01`;

      const endDate = `${year}-${String(
        monthNumber
      ).padStart(2, '0')}-${String(
        lastDay
      ).padStart(2, '0')}`;

      const response = await api.get(
        '/attendance',
        {
          params: {
            branchId,
            startDate,
            endDate,
          },
        }
      );

      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.attendance || [];

      setAttendance(data);
    } catch (err: any) {
      console.error(
        'Failed to load attendance:',
        err
      );

      setAttendance([]);

      setError(
        err?.response?.data?.message ||
          'Failed to load attendance history.'
      );
    } finally {
      setLoading(false);
    }
  }

  const filteredEmployees = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    return employees.filter((item) => {
      const matchesEmployee =
        selectedEmployeeId === 'ALL' ||
        item.id === selectedEmployeeId;

      const matchesSearch =
        !query ||
        item.fullName
          .toLowerCase()
          .includes(query) ||
        item.loginId
          ?.toLowerCase()
          .includes(query) ||
        item.department
          ?.toLowerCase()
          .includes(query);

      return (
        matchesEmployee &&
        matchesSearch
      );
    });
  }, [
    employees,
    selectedEmployeeId,
    search,
  ]);

  const attendanceMap = useMemo(() => {
    const map = new Map<
      string,
      AttendanceRecord
    >();

    attendance.forEach((record) => {
      const key =
        record.employeeId +
        '_' +
        dateOnly(record.date);

      map.set(key, record);
    });

    return map;
  }, [attendance]);

  return (
    <div>
      Attendance History
    </div>
  );
}