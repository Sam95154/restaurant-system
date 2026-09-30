import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';

interface TopHeaderProps {
  onMenuClick: () => void;
}

interface Branch {
  id: string;
  name: string;
  city?: string;
  state?: string;
  status?: string;
}

const pageTitles: Record<string, string> = {
  '/staff': 'Overview',
  '/staff/dashboard': 'Dashboard',
  '/staff/pos': 'Point of Sale',
  '/staff/orders': 'Orders',
  '/staff/kitchen': 'Kitchen',
  '/staff/tables': 'Tables',
  '/staff/menu': 'Menu',
  '/staff/inventory': 'Inventory',
  '/staff/purchases': 'Purchases',
  '/staff/customers': 'Customers',
  '/staff/employees': 'Employees',
  '/staff/attendance': 'Attendance',
  '/staff/payroll': 'Payroll',
  '/staff/expenses': 'Expenses',
  '/staff/reports': 'Reports',
  '/staff/audit-logs': 'Audit Logs',
  '/staff/settings': 'Settings',
};

const SELECTED_BRANCH_KEY = 'selected_branch_id';

export default function TopHeader({
  onMenuClick,
}: TopHeaderProps) {
  const { employee } = useAuth();
  const location = useLocation();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] =
    useState<string>('');

  const [branchLoading, setBranchLoading] =
    useState(false);

  const title =
    pageTitles[location.pathname] ?? 'SAM’S RMS';

  const initials =
    employee?.fullName
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => name[0]?.toUpperCase())
      .join('') || 'S';

  const isSuperAdmin =
    employee?.role === 'SUPER_ADMIN';

  /**
   * Load branches for Super Admin.
   *
   * Managers/employees already have their
   * branchId inside their authenticated session.
   */
  useEffect(() => {
    if (!isSuperAdmin) {
      setBranches([]);
      setSelectedBranchId(
        employee?.branchId || ''
      );
      return;
    }

    let cancelled = false;

    async function loadBranches() {
      try {
        setBranchLoading(true);

        const response =
          await api.get('/branches');

        const data: Branch[] = Array.isArray(response.data)
  ? response.data
  : response.data?.branches ?? [];

        if (cancelled) {
          return;
        }

        setBranches(data);

        const savedBranchId =
          localStorage.getItem(
            SELECTED_BRANCH_KEY
          );

        const savedBranchExists =
          savedBranchId &&
          data.some(
            (branch) =>
              branch.id === savedBranchId
          );

        if (savedBranchExists) {
          setSelectedBranchId(
            savedBranchId as string
          );
        } else {
          setSelectedBranchId('');
        }
      } catch (error) {
        console.error(
          'Failed to load branches:',
          error
        );
      } finally {
        if (!cancelled) {
          setBranchLoading(false);
        }
      }
    }

    loadBranches();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, employee?.branchId]);

  /**
   * Keep the selected branch available to
   * other pages such as Inventory, Suppliers
   * and Purchases.
   */
  function handleBranchChange(
    branchId: string
  ) {
    setSelectedBranchId(branchId);

    if (branchId) {
      localStorage.setItem(
        SELECTED_BRANCH_KEY,
        branchId
      );
    } else {
      localStorage.removeItem(
        SELECTED_BRANCH_KEY
      );
    }

    window.dispatchEvent(
      new CustomEvent('branchChanged', {
        detail: {
          branchId,
        },
      })
    );
  }

  const selectedBranch =
    branches.find(
      (branch) =>
        branch.id === selectedBranchId
    );

  const branchLabel =
    isSuperAdmin
      ? selectedBranch?.name ||
        'Select Branch'
      : 'Assigned Branch';

  return (
    <header className="sticky top-0 z-30 border-b border-coffee/10 bg-white/95 backdrop-blur">
      <div className="flex h-20 items-center gap-4 px-4 sm:px-6 lg:px-8">

        {/* Mobile menu */}
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-coffee/10 text-coffee-dark hover:bg-cream lg:hidden"
          aria-label="Open navigation"
        >
          ☰
        </button>

        {/* Page title */}
        <div className="min-w-0">
          <h1 className="truncate font-serif text-xl font-bold text-coffee-dark sm:text-2xl">
            {title}
          </h1>

          <p className="hidden text-xs text-coffee/50 sm:block">
            Manage your restaurant operations
          </p>
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">

          {/* Search */}
          <div className="hidden md:block">
            <div className="flex h-11 w-56 items-center gap-2 rounded-xl border border-coffee/10 bg-cream/60 px-3 text-coffee/50 lg:w-72">
              <span className="text-base">
                ⌕
              </span>

              <input
                type="search"
                placeholder="Search..."
                className="w-full bg-transparent text-sm text-coffee-dark outline-none placeholder:text-coffee/40"
              />

              <span className="hidden rounded-md border border-coffee/10 bg-white px-1.5 py-0.5 text-[10px] text-coffee/40 lg:inline">
                Ctrl K
              </span>
            </div>
          </div>

          {/* Notification */}
          <button
            type="button"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-coffee/10 bg-white text-coffee-dark hover:bg-cream"
            aria-label="Notifications"
          >
            <span className="text-lg">
              ♢
            </span>

            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-chili" />
          </button>

          {/* Branch selector */}
          {isSuperAdmin ? (
            <div className="hidden items-center gap-2 rounded-xl border border-coffee/10 bg-cream/60 px-3 py-2 sm:flex">

              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-leaf text-sm text-white">
                B
              </span>

              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-coffee/40">
                  Branch
                </div>

                <select
                  value={selectedBranchId}
                  onChange={(event) =>
                    handleBranchChange(
                      event.target.value
                    )
                  }
                  disabled={branchLoading}
                  className="max-w-32 cursor-pointer bg-transparent text-xs font-semibold text-coffee-dark outline-none"
                >
                  <option value="">
                    {branchLoading
                      ? 'Loading...'
                      : 'Select Branch'}
                  </option>

                  {branches.map(
                    (branch) => (
                      <option
                        key={branch.id}
                        value={branch.id}
                      >
                        {branch.name}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
          ) : (
            <div className="hidden items-center gap-2 rounded-xl border border-coffee/10 bg-cream/60 px-3 py-2 sm:flex">

              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-leaf text-sm text-white">
                B
              </span>

              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-coffee/40">
                  Branch
                </div>

                <div className="max-w-24 truncate text-xs font-semibold text-coffee-dark">
                  {branchLabel}
                </div>
              </div>
            </div>
          )}

          {/* Profile */}
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-coffee/10 bg-white p-1.5 pr-2 hover:bg-cream"
            aria-label="Open profile menu"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-turmeric font-bold text-coffee-dark">
              {initials}
            </span>

            <span className="hidden text-left sm:block">
              <span className="block max-w-28 truncate text-xs font-semibold text-coffee-dark">
                {employee?.fullName ??
                  'Staff User'}
              </span>

              <span className="block text-[10px] text-coffee/50">
                {employee?.role ??
                  'Employee'}
              </span>
            </span>

            <span className="hidden text-xs text-coffee/40 sm:block">
              ⌄
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}