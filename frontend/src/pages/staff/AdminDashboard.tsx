import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface DashboardStats {
  totalBranches: number;
  openBranches: number;
  totalEmployees: number;
  totalCustomers: number;
  totalTables: number;
  totalItems: number;
  ordersToday: number;
  pending: number;
  preparing: number;
  ready: number;
  completed: number;
  salesToday: number;
}

function StatCard({
  label,
  value,
  description,
  icon,
  accent = 'turmeric',
}: {
  label: string;
  value: string | number;
  description?: string;
  icon: string;
  accent?: 'turmeric' | 'leaf' | 'chili' | 'coffee';
}) {
  const accentClasses = {
    turmeric: 'bg-turmeric/15 text-turmeric-deep',
    leaf: 'bg-leaf/15 text-leaf-deep',
    chili: 'bg-chili/10 text-chili',
    coffee: 'bg-coffee/10 text-coffee',
  };

  return (
    <div className="group rounded-2xl border border-coffee/10 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-coffee/45">
            {label}
          </p>

          <p className="mt-3 font-serif text-3xl font-bold text-coffee-dark">
            {value}
          </p>

          {description && (
            <p className="mt-1 text-xs text-coffee/50">
              {description}
            </p>
          )}
        </div>

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg ${accentClasses[accent]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function OrderStatusCard({
  label,
  value,
  icon,
  description,
}: {
  label: string;
  value: number;
  icon: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-coffee/10 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream text-coffee-dark">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-coffee-dark">
            {label}
          </p>

          <p className="text-xs text-coffee/45">
            {description}
          </p>
        </div>

        <div className="ml-auto font-serif text-2xl font-bold text-coffee-dark">
          {value}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError('');

        const res = await api.get('/reports/dashboard');

        if (mounted) {
          setStats(res.data);
        }
      } catch (err: any) {
        if (mounted) {
          setError(
            err?.message || 'Unable to load dashboard data.'
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-52 animate-pulse rounded-lg bg-coffee/10" />
          <div className="mt-2 h-4 w-80 animate-pulse rounded bg-coffee/5" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl bg-white shadow-sm"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="font-semibold text-chili">
          Dashboard unavailable
        </h2>

        <p className="mt-1 text-sm text-chili/80">
          {error}
        </p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-coffee/10 bg-white p-8 text-center">
        <p className="text-sm text-coffee/60">
          No dashboard data available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-leaf">
            Restaurant Overview
          </p>

          <h1 className="mt-1 font-serif text-3xl font-bold text-coffee-dark sm:text-4xl">
            Dashboard
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-coffee/55">
            Monitor today's restaurant operations, orders, staff,
            tables and sales from one place.
          </p>
        </div>

        <div className="rounded-xl border border-coffee/10 bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-coffee/40">
            Today's sales
          </p>

          <p className="mt-1 font-serif text-2xl font-bold text-coffee-dark">
            ₹{stats.salesToday.toLocaleString('en-IN')}
          </p>
        </div>
      </section>

      {/* Primary statistics */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold text-coffee-dark">
            Business Overview
          </h2>

          <span className="text-xs text-coffee/40">
            Live database statistics
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Today's Sales"
            value={`₹${stats.salesToday.toLocaleString('en-IN')}`}
            description="Paid bills today"
            icon="₹"
            accent="turmeric"
          />

          <StatCard
            label="Orders Today"
            value={stats.ordersToday}
            description="Orders created today"
            icon="▣"
            accent="leaf"
          />

          <StatCard
            label="Customers"
            value={stats.totalCustomers}
            description="Registered customers"
            icon="♙"
            accent="coffee"
          />

          <StatCard
            label="Active Staff"
            value={stats.totalEmployees}
            description="Active employees"
            icon="♟"
            accent="chili"
          />
        </div>
      </section>

      {/* Restaurant resources */}
      <section>
        <h2 className="mb-3 font-serif text-lg font-bold text-coffee-dark">
          Restaurant Resources
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Branches"
            value={`${stats.openBranches}/${stats.totalBranches}`}
            description="Open / total branches"
            icon="B"
            accent="leaf"
          />

          <StatCard
            label="Tables"
            value={stats.totalTables}
            description="Configured restaurant tables"
            icon="▦"
            accent="turmeric"
          />

          <StatCard
            label="Menu Items"
            value={stats.totalItems}
            description="Active menu items"
            icon="☰"
            accent="coffee"
          />

          <StatCard
            label="Completed"
            value={stats.completed}
            description="Completed orders"
            icon="✓"
            accent="leaf"
          />
        </div>
      </section>

      {/* Order operations */}
      <section>
        <div className="mb-3">
          <h2 className="font-serif text-lg font-bold text-coffee-dark">
            Order Operations
          </h2>

          <p className="mt-1 text-xs text-coffee/45">
            Current order status counts
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OrderStatusCard
            label="Pending"
            value={stats.pending}
            icon="◷"
            description="Waiting for processing"
          />

          <OrderStatusCard
            label="Preparing"
            value={stats.preparing}
            icon="♨"
            description="Currently in kitchen"
          />

          <OrderStatusCard
            label="Ready"
            value={stats.ready}
            icon="✓"
            description="Ready to be served"
          />

          <OrderStatusCard
            label="Completed"
            value={stats.completed}
            icon="★"
            description="Completed orders"
          />
        </div>
      </section>

      {/* Operations summary */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-coffee/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-bold text-coffee-dark">
                Order Pipeline
              </h2>

              <p className="mt-1 text-xs text-coffee/45">
                Orders currently moving through operations
              </p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-turmeric/15 text-turmeric-deep">
              ▤
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium text-coffee-dark">
                  Pending
                </span>

                <span className="text-coffee/50">
                  {stats.pending}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-cream">
                <div
                  className="h-full rounded-full bg-turmeric"
                  style={{
                    width: `${Math.min(stats.pending * 10, 100)}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium text-coffee-dark">
                  Preparing
                </span>

                <span className="text-coffee/50">
                  {stats.preparing}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-cream">
                <div
                  className="h-full rounded-full bg-leaf"
                  style={{
                    width: `${Math.min(stats.preparing * 10, 100)}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium text-coffee-dark">
                  Ready
                </span>

                <span className="text-coffee/50">
                  {stats.ready}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-cream">
                <div
                  className="h-full rounded-full bg-chili"
                  style={{
                    width: `${Math.min(stats.ready * 10, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-coffee/10 bg-coffee-dark p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
            Today's Snapshot
          </p>

          <h2 className="mt-2 font-serif text-2xl font-bold">
            Keep the operation moving
          </h2>

          <p className="mt-2 text-sm leading-6 text-white/60">
            Use the POS, Orders and Kitchen sections to manage
            service from order creation through completion.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/10 p-4">
              <p className="text-xs text-white/45">
                Orders
              </p>

              <p className="mt-1 font-serif text-2xl font-bold">
                {stats.ordersToday}
              </p>
            </div>

            <div className="rounded-xl bg-white/10 p-4">
              <p className="text-xs text-white/45">
                Sales
              </p>

              <p className="mt-1 font-serif text-2xl font-bold">
                ₹{stats.salesToday.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}