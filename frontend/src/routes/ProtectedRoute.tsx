import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { EmployeeRole } from '../types';

// Frontend route guard for UX only - every real authorization check also
// happens on the backend (requireRole/requireBranchAccess). Hiding a link
// here is not security; the API is what actually enforces access.
export function ProtectedRoute({ roles, children }: { roles?: EmployeeRole[]; children: React.ReactNode }) {
  const { employee } = useAuth();
  if (!employee) return <Navigate to="/staff/login" replace />;
  if (roles && !roles.includes(employee.role)) return <Navigate to="/staff/login" replace />;
  return <>{children}</>;
}
