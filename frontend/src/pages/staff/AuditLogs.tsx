import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';

type AuditLog = {
  id: string;
  userId: string | null;
  userRole: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatMetadata(
  metadata: Record<string, unknown> | null,
) {
  if (!metadata) {
    return '—';
  }

  return JSON.stringify(metadata, null, 2);
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [selectedLog, setSelectedLog] =
    useState<AuditLog | null>(null);

  async function loadLogs(showRefreshState = false) {
    try {
      setError('');

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get('/audit');

      const data = response.data;

      setLogs(
        Array.isArray(data?.logs)
          ? data.logs
          : [],
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Failed to load audit logs.';

      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  const actions = useMemo(() => {
    return Array.from(
      new Set(
        logs
          .map((log) => log.action)
          .filter(Boolean),
      ),
    ).sort();
  }, [logs]);

  const entities = useMemo(() => {
    return Array.from(
      new Set(
        logs
          .map((log) => log.entity)
          .filter(Boolean),
      ),
    ).sort();
  }, [logs]);

  const roles = useMemo(() => {
    return Array.from(
      new Set(
        logs
          .map((log) => log.userRole)
          .filter(Boolean) as string[],
      ),
    ).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return logs.filter((log) => {
      const searchableText = [
        log.userId,
        log.userRole,
        log.action,
        log.entity,
        log.entityId,
        log.metadata
          ? JSON.stringify(log.metadata)
          : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !query ||
        searchableText.includes(query);

      const matchesAction =
        !actionFilter ||
        log.action === actionFilter;

      const matchesEntity =
        !entityFilter ||
        log.entity === entityFilter;

      const matchesRole =
        !roleFilter ||
        log.userRole === roleFilter;

      return (
        matchesSearch &&
        matchesAction &&
        matchesEntity &&
        matchesRole
      );
    });
  }, [
    logs,
    search,
    actionFilter,
    entityFilter,
    roleFilter,
  ]);

  function clearFilters() {
    setSearch('');
    setActionFilter('');
    setEntityFilter('');
    setRoleFilter('');
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Audit Logs
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Review administrative and system activity
            recorded by the restaurant management system.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadLogs(true)}
          disabled={refreshing}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing
            ? 'Refreshing...'
            : 'Refresh'}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">
            Loaded Logs
          </p>

          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {logs.length}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">
            Matching Logs
          </p>

          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {filteredLogs.length}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">
            Actions
          </p>

          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {actions.length}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">
            Entities
          </p>

          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {entities.length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Search
            </label>

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search user, action, entity, ID..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Action
            </label>

            <select
              value={actionFilter}
              onChange={(event) =>
                setActionFilter(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
            >
              <option value="">
                All Actions
              </option>

              {actions.map((action) => (
                <option
                  key={action}
                  value={action}
                >
                  {action}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Entity
            </label>

            <select
              value={entityFilter}
              onChange={(event) =>
                setEntityFilter(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
            >
              <option value="">
                All Entities
              </option>

              {entities.map((entity) => (
                <option
                  key={entity}
                  value={entity}
                >
                  {entity}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Role
            </label>

            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
            >
              <option value="">
                All Roles
              </option>

              {roles.map((role) => (
                <option
                  key={role}
                  value={role}
                >
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Loading audit logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No audit logs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Date & Time
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    User
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Role
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Action
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Entity
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Entity ID
                  </th>

                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Details
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="transition hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {formatDate(log.createdAt)}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span className="break-all">
                        {log.userId || 'System'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700">
                      {log.userRole || '—'}
                    </td>

                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {log.action}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700">
                      {log.entity}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="block max-w-[220px] break-all">
                        {log.entityId || '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedLog(log)
                        }
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Metadata modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Audit Log Details
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {selectedLog.action} ·{' '}
                  {selectedLog.entity}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg px-3 py-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Date & Time
                  </p>

                  <p className="mt-1 text-sm text-gray-900">
                    {formatDate(selectedLog.createdAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    User ID
                  </p>

                  <p className="mt-1 break-all text-sm text-gray-900">
                    {selectedLog.userId || 'System'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Role
                  </p>

                  <p className="mt-1 text-sm text-gray-900">
                    {selectedLog.userRole || '—'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Action
                  </p>

                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {selectedLog.action}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Entity
                  </p>

                  <p className="mt-1 text-sm text-gray-900">
                    {selectedLog.entity}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Entity ID
                  </p>

                  <p className="mt-1 break-all text-sm text-gray-900">
                    {selectedLog.entityId || '—'}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Metadata
                </p>

                <pre className="max-h-80 overflow-auto rounded-lg bg-gray-900 p-4 text-xs leading-5 text-gray-100">
                  {formatMetadata(selectedLog.metadata)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}