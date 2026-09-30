import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

type Role =
  | 'SUPER_ADMIN'
  | 'MANAGER'
  | 'SERVICE_EMPLOYEE'
  | 'KITCHEN_EMPLOYEE'
  | 'BILLING_EMPLOYEE';

interface NavItem {
  label: string;
  to: string;
  icon: string;
  roles: Role[];
}

const navigation: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/staff/dashboard',
    icon: '⌂',
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
    label: 'POS',
    to: '/staff/pos',
    icon: '▣',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
      'SERVICE_EMPLOYEE',
      'BILLING_EMPLOYEE',
    ],
  },
  {
    label: 'Orders',
    to: '/staff/orders',
    icon: '☷',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
      'SERVICE_EMPLOYEE',
      'BILLING_EMPLOYEE',
    ],
  },
  {
    label: 'Billing',
    to: '/staff/billing',
    icon: '₹',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
      'BILLING_EMPLOYEE',
    ],
  },
  {
    label: 'Kitchen',
    to: '/staff/kitchen',
    icon: '♨',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
      'KITCHEN_EMPLOYEE',
      'SERVICE_EMPLOYEE',
    ],
  },
  {
    label: 'Tables',
    to: '/staff/tables',
    icon: '▦',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
      'SERVICE_EMPLOYEE',
    ],
  },
  {
    label: 'Menu',
    to: '/staff/menu',
    icon: '☰',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
    ],
  },
  {
    label: 'Inventory',
    to: '/staff/inventory',
    icon: '▤',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
      'KITCHEN_EMPLOYEE',
    ],
  },
  {
    label: 'Purchases',
    to: '/staff/purchases',
    icon: '▥',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
    ],
  },
  {
    label: 'Customers',
    to: '/staff/customers',
    icon: '♙',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
      'SERVICE_EMPLOYEE',
      'BILLING_EMPLOYEE',
    ],
  },
  {
    label: 'Branches',
    to: '/staff/branches',
    icon: '⌂',
    roles: ['SUPER_ADMIN'],
  },
  {
    label: 'Employees',
    to: '/staff/employees',
    icon: '♟',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
    ],
  },
  {
    label: 'Attendance',
    to: '/staff/attendance',
    icon: '✓',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
    ],
  },
  {
    label: 'Payroll',
    to: '/staff/payroll',
    icon: '₹',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
    ],
  },
  {
    label: 'Expenses',
    to: '/staff/expenses',
    icon: '−',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
    ],
  },
  {
    label: 'Reports',
    to: '/staff/reports',
    icon: '▥',
    roles: [
      'SUPER_ADMIN',
      'MANAGER',
    ],
  },
  {
    label: 'Audit Logs',
    to: '/staff/audit-logs',
    icon: '▤',
    roles: ['SUPER_ADMIN'],
  },
  {
    label: 'Settings',
    to: '/staff/settings',
    icon: '⚙',
    roles: ['SUPER_ADMIN'],
  },
];

export default function Sidebar() {
  const { employee } = useAuth();

  const role = employee?.role as Role | undefined;

  const visibleNavigation = navigation.filter((item) => {
    if (!role) return false;
    return item.roles.includes(role);
  });

  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col">
      
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="text-xl font-bold text-white">
          SAM'S RMS
        </div>

        <div className="text-xs text-slate-400 mt-1">
          Restaurant Management System
        </div>
      </div>

      {/* Logged-in employee */}
      <div className="px-5 py-4 border-b border-slate-700">
        <div className="text-sm font-semibold">
          {employee?.fullName || 'Staff'}
        </div>

        <div className="text-xs text-slate-400 mt-1">
          {employee?.role || 'No Role'}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
                  isActive
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                ].join(' ')
              }
            >
              <span className="w-5 text-center">
                {item.icon}
              </span>

              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-5 py-3 border-t border-slate-700 text-xs text-slate-500">
        SAM'S RMS
      </div>
    </aside>
  );
}