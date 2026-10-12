import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import EmployeeLogin from './pages/EmployeeLogin';

import StaffHome from './pages/staff/StaffHome';
import AdminDashboard from './pages/staff/AdminDashboard';
import POS from './pages/staff/POS';
import KitchenBoard from './pages/staff/KitchenBoard';
import Orders from './pages/staff/Orders';
import Branches from './pages/staff/Branches';
import Billing from './pages/staff/Billing';
import Tables from './pages/staff/Tables';
import Menu from './pages/staff/Menu';
import Inventory from './pages/staff/Inventory';
import Employees from './pages/staff/Employees';
import EmployeeDetails from './pages/staff/EmployeeDetails';
import Suppliers from './pages/staff/Suppliers';
import Purchases from './pages/staff/Purchases';
import Attendance from './pages/staff/Attendance';
import Settings from './pages/staff/Settings';
import Payroll from './pages/staff/Payroll';
import Expenses from './pages/staff/Expenses';
import CustomerLogin from './pages/customer/CustomerLogin';
import CustomerOrder from './pages/customer/CustomerOrder';
import Reports from './pages/staff/Reports';
import { ProtectedRoute } from './routes/ProtectedRoute';
import StaffLayout from './components/layout/StaffLayout';
import AuditLogs from './pages/staff/AuditLogs';
import Coupons from './pages/staff/Coupons';
import CustomerWaitingQueue from './pages/customer/WaitingQueue';
import StaffWaitingQueue from './pages/staff/WaitingQueue';
import FeedbackReviews from './pages/staff/FeedbackReviews';

export default function App() {
  return (
    <Routes>

      {/* =====================================================
          ROOT
      ===================================================== */}

      <Route
        path="/"
        element={
          <Navigate
            to="/staff/login"
            replace
          />
        }
      />

      {/* =====================================================
          CUSTOMER LOGIN
      ===================================================== */}

      <Route
        path="/login"
        element={
          <CustomerLogin />
        }
      />

      {/* =====================================================
          CUSTOMER QR ORDERING
      ===================================================== */}

      <Route
        path="/order"
        element={
          <CustomerOrder />
        }
      />

      {/* =====================================================
          STAFF LOGIN
      ===================================================== */}

      <Route
        path="/staff/login"
        element={
          <EmployeeLogin />
        }
      />

      {/* =====================================================
          STAFF HOME
      ===================================================== */}

      <Route
        path="/staff"
        element={
          <ProtectedRoute>
            <StaffLayout>
              <StaffHome />
            </StaffLayout>
          </ProtectedRoute>
        }
      />

      {/* =====================================================
          ADMIN DASHBOARD
      ===================================================== */}

      <Route
        path="/staff/dashboard"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
              'MANAGER',
            ]}
          >
            <StaffLayout>
              <AdminDashboard />
            </StaffLayout>
          </ProtectedRoute>
        }
      />

      {/* =====================================================
          POS
      ===================================================== */}

      <Route
        path="/staff/pos"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
              'MANAGER',
              'SERVICE_EMPLOYEE',
              'BILLING_EMPLOYEE',
            ]}
          >
            <StaffLayout>
              <POS />
            </StaffLayout>
          </ProtectedRoute>
        }
      />

      {/* =====================================================
          ORDERS
      ===================================================== */}

      <Route
        path="/staff/orders"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
              'MANAGER',
              'SERVICE_EMPLOYEE',
              'BILLING_EMPLOYEE',
            ]}
          >
            <StaffLayout>
              <Orders />
            </StaffLayout>
          </ProtectedRoute>
        }
      />
      <Route
  path="/queue"
  element={
    <CustomerWaitingQueue />
  }
/>

      {/* =====================================================
          BILLING
      ===================================================== */}

      <Route
        path="/staff/billing"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
              'MANAGER',
              'BILLING_EMPLOYEE',
            ]}
          >
            <StaffLayout>
              <Billing />
            </StaffLayout>
          </ProtectedRoute>
        }
      />

      {/* =====================================================
          KITCHEN
      ===================================================== */}

      <Route
        path="/staff/kitchen"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
              'MANAGER',
              'KITCHEN_EMPLOYEE',
              'SERVICE_EMPLOYEE',
            ]}
          >
            <StaffLayout>
              <KitchenBoard />
            </StaffLayout>
          </ProtectedRoute>
        }
      />

      {/* =====================================================
          BRANCHES
      ===================================================== */}

      <Route
        path="/staff/branches"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
            ]}
          >
            <StaffLayout>
              <Branches />
            </StaffLayout>
          </ProtectedRoute>
        }
      />

      {/* =====================================================
          TABLES
      ===================================================== */}

      <Route
        path="/staff/tables"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
              'MANAGER',
              'SERVICE_EMPLOYEE',
            ]}
          >
            <StaffLayout>
              <Tables />
            </StaffLayout>
          </ProtectedRoute>
        }
      />
      <Route
  path="/staff/waiting-queue"
  element={
    <ProtectedRoute
      roles={[
        'SUPER_ADMIN',
        'MANAGER',
        'SERVICE_EMPLOYEE',
      ]}
    >
      <StaffLayout>
        <StaffWaitingQueue />
      </StaffLayout>
    </ProtectedRoute>
  }
/>
      <Route
  path="/staff/inventory"
  element={
    <ProtectedRoute roles={['SUPER_ADMIN', 'MANAGER']}>
      <StaffLayout>
        <Inventory />
      </StaffLayout>
    </ProtectedRoute>
  }
/>
<Route
  path="/staff/suppliers"
  element={
    <ProtectedRoute
      roles={['SUPER_ADMIN', 'MANAGER']}
    >
      <Suppliers />
    </ProtectedRoute>
  }
/>
<Route
  path="/staff/purchases"
  element={
    <ProtectedRoute roles={['SUPER_ADMIN', 'MANAGER']}>
      <StaffLayout>
        <Purchases />
      </StaffLayout>
    </ProtectedRoute>
  }
/>
      {/* =====================================================
          MENU
      ===================================================== */}

      <Route
        path="/staff/menu"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
              'MANAGER',
            ]}
          >
            <StaffLayout>
              <Menu />
            </StaffLayout>
          </ProtectedRoute>
        }
      />

      {/* =====================================================
          EMPLOYEES
      ===================================================== */}

      <Route
        path="/staff/employees"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
              'MANAGER',
            ]}
          >
            <StaffLayout>
              <Employees />
            </StaffLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/employees/:employeeId"
        element={
          <ProtectedRoute
            roles={[
              'SUPER_ADMIN',
              'MANAGER',
            ]}
          >
            <StaffLayout>
              <EmployeeDetails />
            </StaffLayout>
          </ProtectedRoute>
        }
      />

      <Route
  path="/staff/attendance"
  element={
    <ProtectedRoute
      roles={['SUPER_ADMIN', 'MANAGER']}
    >
      <Attendance />
    </ProtectedRoute>
  }
/>
<Route
  path="/staff/payroll"
  element={
    <ProtectedRoute
      roles={['SUPER_ADMIN', 'MANAGER']}
    >
      <StaffLayout>
        <Payroll />
      </StaffLayout>
    </ProtectedRoute>
  }
/><Route
  path="/staff/settings"
  element={
    <ProtectedRoute roles={['SUPER_ADMIN', 'MANAGER']}>
      <Settings />
    </ProtectedRoute>
  }
/>

{/* =====================================================
    EXPENSES
===================================================== */}

<Route
  path="/staff/expenses"
  element={
    <ProtectedRoute
      roles={['SUPER_ADMIN', 'MANAGER']}
    >
      <StaffLayout>
        <Expenses />
      </StaffLayout>
    </ProtectedRoute>
  }
/>
      <Route
  path="/staff/reports"
  element={
    <ProtectedRoute
      roles={['SUPER_ADMIN', 'MANAGER']}
    >
      <StaffLayout>
        <Reports />
      </StaffLayout>
    </ProtectedRoute>
  }
  />
  <Route
  path="/staff/coupons"
  element={
    <ProtectedRoute roles={['SUPER_ADMIN', 'MANAGER']}>
      <StaffLayout>
        <Coupons />
      </StaffLayout>
    </ProtectedRoute>
  }
/>
<Route
  path="/staff/audit-logs"
  element={
    <ProtectedRoute
      roles={['SUPER_ADMIN']}
    >
      <StaffLayout>
        <AuditLogs />
      </StaffLayout>
    </ProtectedRoute>
  }
/>
      {/* =====================================================
          FEEDBACK & REVIEWS
      ===================================================== */}
      <Route
        path="/staff/reviews"
        element={
          <ProtectedRoute roles={['SUPER_ADMIN', 'MANAGER']}>
            <StaffLayout>
              <FeedbackReviews />
            </StaffLayout>
          </ProtectedRoute>
        }
      />

      {/* =====================================================
          404
      ===================================================== */}

      <Route
        path="*"
        element={
          <div className="flex min-h-screen items-center justify-center bg-cream p-8">
            <div className="text-center">

              <div className="font-serif text-7xl font-bold text-coffee-dark">
                404
              </div>

              <h1 className="mt-4 text-2xl font-bold text-coffee-dark">
                Page Not Found
              </h1>

              <p className="mt-2 text-sm text-coffee/60">
                The page you are looking for does not exist.
              </p>

              <a
                href="/"
                className="mt-6 inline-flex rounded-xl bg-turmeric px-6 py-3 text-sm font-bold text-coffee-dark transition hover:bg-turmeric-deep"
              >
                Go Home
              </a>

            </div>
          </div>
        }
      />

    </Routes>
  );
}


