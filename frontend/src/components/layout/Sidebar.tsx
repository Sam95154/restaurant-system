import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api, API_BASE_URL } from '../../api/client';
import type { EmployeeRole } from '../../types';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  to: string;
  icon: string;
  roles?: EmployeeRole[];
}

interface BranchBrand {
  id: string;
  name: string;
  logoUrl: string | null;
}

const navigation: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/staff/dashboard',
    icon: '⌂',
    roles: ['SUPER_ADMIN', 'MANAGER', 'BILLING_EMPLOYEE'],
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
    roles: ['SUPER_ADMIN', 'MANAGER', 'BILLING_EMPLOYEE'],
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
    roles: ['SUPER_ADMIN', 'MANAGER', 'SERVICE_EMPLOYEE'],
  },
  {
    label: 'Menu',
    to: '/staff/menu',
    icon: '☰',
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
    label: 'Inventory',
    to: '/staff/inventory',
    icon: '📦',
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
    label: 'Suppliers',
    to: '/staff/suppliers',
    icon: '🚚',
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
    label: 'Purchases',
    to: '/staff/purchases',
    icon: '🛒',
    roles: ['SUPER_ADMIN', 'MANAGER'],
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
    label: 'Waiting Queue',
    to: '/staff/waiting-queue',
    icon: '🎟️',
    roles: ['SUPER_ADMIN', 'MANAGER', 'SERVICE_EMPLOYEE'],
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
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
    label: 'Attendance',
    to: '/staff/attendance',
    icon: '◷',
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
    label: 'Payroll',
    to: '/staff/payroll',
    icon: '₹',
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
    label: 'Expenses',
    to: '/staff/expenses',
    icon: '◈',
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
  label: 'Coupons',
  to: '/staff/coupons',
  icon: '🎟️',
  roles: ['SUPER_ADMIN', 'MANAGER'],
 },
  {
    label: 'Reports',
    to: '/staff/reports',
    icon: '▥',
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
    label: 'Audit Logs',
    to: '/staff/audit-logs',
    icon: '◌',
    roles: ['SUPER_ADMIN', 'MANAGER'],
  },
  {
    label: 'Settings',
    to: '/staff/settings',
    icon: '⚙',
    roles: ['SUPER_ADMIN'],
  },
];

function isAllowed(item: NavItem, role?: EmployeeRole) {
  if (!item.roles) {
    return true;
  }

  return !!role && item.roles.includes(role);
}

const API_ROOT = API_BASE_URL.replace(/\/api\/?$/, '');

function getLogoUrl(logoUrl: string | null) {
  if (!logoUrl) {
    return null;
  }

  if (
    logoUrl.startsWith('http://') ||
    logoUrl.startsWith('https://')
  ) {
    return logoUrl;
  }

  return `${API_ROOT}${logoUrl}`;
}

export default function Sidebar({
  mobileOpen,
  onClose,
}: SidebarProps) {
  const { employee } = useAuth();

  const [brand, setBrand] = useState<BranchBrand | null>(null);

  const visibleItems = navigation.filter((item) =>
    isAllowed(item, employee?.role),
  );

  useEffect(() => {
    let cancelled = false;

    async function loadBrand() {
      try {
        const response = await api.get('/branches');

        const branches = (
          response.data?.branches ??
          response.data ??
          []
        ) as BranchBrand[];

        if (!Array.isArray(branches) || branches.length === 0) {
          return;
        }

        let selectedBranch: BranchBrand | undefined;

        if (employee?.branchId) {
          selectedBranch = branches.find(
            (item) => item.id === employee.branchId,
          );
        }

        if (!selectedBranch) {
          selectedBranch = branches.find(
            (item) => item.logoUrl,
          );
        }

        if (!selectedBranch) {
          selectedBranch = branches[0];
        }

        if (!cancelled) {
          setBrand(selectedBranch);
        }
      } catch (error) {
        console.error('Failed to load restaurant branding:', error);
      }
    }

    loadBrand();

    return () => {
      cancelled = true;
    };
  }, [employee?.branchId]);

  const logoUrl = getLogoUrl(brand?.logoUrl ?? null);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col',
          'bg-coffee-dark text-white shadow-2xl',
          'transition-transform duration-300',
          mobileOpen
            ? 'translate-x-0'
            : '-translate-x-full',
          'lg:static lg:z-auto lg:translate-x-0',
        ].join(' ')}
      >
        {/* Restaurant Branding */}
        <div className="flex h-20 items-center border-b border-white/10 px-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-turmeric text-coffee-dark">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${brand?.name ?? "Restaurant"} logo`}
                className="h-full w-full object-contain bg-white"
                onError={() => setBrand((current) =>
                  current
                    ? { ...current, logoUrl: null }
                    : current,
                )}
              />
            ) : (
              <span className="font-serif text-xl font-bold">
                S
              </span>
            )}
          </div>

          <div className="ml-3 min-w-0">
            <div className="truncate font-serif text-xl font-bold tracking-wide">
              {brand?.name ?? "SAM'S"}
            </div>

            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
              Restaurant Management
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
            Main Menu
          </p>

          <div className="space-y-1">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  [
                    'group flex items-center gap-3 rounded-xl px-3 py-3',
                    'text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-turmeric text-coffee-dark shadow-lg'
                      : 'text-white/70 hover:bg-white/10 hover:text-white',
                  ].join(' ')
                }
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-base group-[.active]:bg-black/10">
                  {item.icon}
                </span>

                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="truncate text-sm font-semibold">
              {employee?.fullName ?? 'Staff User'}
            </div>

            <div className="mt-1 text-xs text-white/45">
              {employee?.role ?? 'Employee'}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
