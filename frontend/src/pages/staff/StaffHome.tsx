import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function StaffHome() {
  const { employee, logout } = useAuth();
  const links: Record<string, { to: string; label: string }[]> = {
    SUPER_ADMIN: [
      { to: '/staff/dashboard', label: 'Dashboard' },
      { to: '/staff/kitchen', label: 'Kitchen board' },
    ],
    MANAGER: [
      { to: '/staff/dashboard', label: 'Dashboard' },
      { to: '/staff/kitchen', label: 'Kitchen board' },
    ],
    KITCHEN_EMPLOYEE: [{ to: '/staff/kitchen', label: 'Kitchen board' }],
    SERVICE_EMPLOYEE: [{ to: '/staff/kitchen', label: 'Kitchen board (view)' }],
    BILLING_EMPLOYEE: [{ to: '/staff/dashboard', label: 'Dashboard' }],
  };

  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-serif text-2xl">Welcome, {employee?.fullName ?? employee?.role}</h1>
          <p className="text-gray-500 text-sm">Role: {employee?.role}</p>
        </div>
        <button onClick={logout} className="text-sm text-chili font-semibold">
          Log out
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        {(links[employee?.role ?? ''] || []).map((l) => (
          <Link key={l.to} to={l.to} className="block bg-white border rounded p-5 hover:border-leaf">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
