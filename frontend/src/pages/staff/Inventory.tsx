import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';

interface Employee {
  role?: string;
  branchId?: string;
}

function useAuth() {
  const [employee] = useState<Employee | null>(() => {
    try {
      const stored = localStorage.getItem('employee');
      return stored ? (JSON.parse(stored) as Employee) : null;
    } catch {
      return null;
    }
  });

  return { employee };
}

type Status = 'ACTIVE' | 'INACTIVE';

type Unit =
  | 'KG'
  | 'GRAM'
  | 'LITRE'
  | 'ML'
  | 'PIECE'
  | 'PACK'
  | 'BOX'
  | 'BOTTLE'
  | 'OTHER';

interface Branch {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  unit: Unit;
  reorderLevel: string | number;
  status: Status;
  branchId: string;
  branch?: Branch;
  stocks?: Stock[];
  stock?: {
  quantity: string | number;
  averageCost: string | number;
  stockValue?: string | number;
  lowStock?: boolean;
};
}

interface Stock {
  id: string;
  quantity: string | number;
  averageCost: string | number;
  branchId: string;
  inventoryItemId: string;
}

const UNITS: Unit[] = [
  'KG',
  'GRAM',
  'LITRE',
  'ML',
  'PIECE',
  'PACK',
  'BOX',
  'BOTTLE',
  'OTHER',
];

function formatNumber(value: string | number | undefined | null) {
  const number = Number(value ?? 0);

  if (Number.isNaN(number)) {
    return '0';
  }

  return number.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });
}

function getErrorMessage(error: any) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    'Something went wrong. Please try again.'
  );
}

export default function Inventory() {
  const { employee } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [selectedBranchId, setSelectedBranchId] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Status>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState<Unit>('KG');
  const [reorderLevel, setReorderLevel] = useState('0');
  
  const [averageCost, setAverageCost] = useState('0');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isSuperAdmin = employee?.role === 'SUPER_ADMIN';

  async function loadBranches() {
    try {
      const response = await api.get('/branches');

      const data = response.data?.branches ?? response.data ?? [];

      setBranches(Array.isArray(data) ? data : []);

      if (!selectedBranchId && data.length > 0) {
        if (employee?.role === 'SUPER_ADMIN') {
          setSelectedBranchId(data[0].id);
        } else if (employee?.branchId) {
          setSelectedBranchId(employee.branchId);
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function loadInventory(branchId?: string) {
    try {
      setError('');

      const branch = branchId || selectedBranchId;

      if (!branch) {
        setItems([]);
        return;
      }

      const response = await api.get('/inventory', {
        params: {
          branchId: branch,
        },
      });

      const data = Array.isArray(response.data)
  ? response.data
  : response.data?.items ?? response.data?.inventory ?? [];

      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getErrorMessage(err));
      setItems([]);
    }
  }

  async function loadAll() {
    try {
      setLoading(true);

      await loadBranches();

      if (employee?.role !== 'SUPER_ADMIN' && employee?.branchId) {
        setSelectedBranchId(employee.branchId);
        await loadInventory(employee.branchId);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedBranchId) {
      loadInventory(selectedBranchId);
    }
  }, [selectedBranchId]);

  async function refresh() {
    try {
      setRefreshing(true);
      setError('');
      await loadInventory();
    } finally {
      setRefreshing(false);
    }
  }

  function clearForm() {
    setName('');
    setSku('');
    setDescription('');
    setUnit('KG');
    setReorderLevel('0');
    setAverageCost('0');
    setEditingItem(null);
  }

  function openAdd() {
    clearForm();
    setError('');
    setSuccess('');
    setModalOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item);

    setName(item.name);
    setSku(item.sku ?? '');
    setDescription(item.description ?? '');
    setUnit(item.unit);
   setReorderLevel(String(item.reorderLevel ?? 0));
setAverageCost(
  String(item.stocks?.[0]?.averageCost ?? 0)
);

    setError('');
    setSuccess('');
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    clearForm();
  }

  async function saveItem(event: React.FormEvent) {
    event.preventDefault();

    setError('');
    setSuccess('');

    if (!selectedBranchId) {
      setError('Please select a branch.');
      return;
    }

    if (!name.trim()) {
      setError('Inventory item name is required.');
      return;
    }

    const reorder = Number(reorderLevel);

    if (Number.isNaN(reorder) || reorder < 0) {
      setError('Reorder level must be zero or greater.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        description: description.trim() || undefined,
        unit,
        reorderLevel: reorder,
averageCost: Number(averageCost),
branchId: selectedBranchId,
      };

      if (editingItem) {
        await api.put(`/inventory/${editingItem.id}`, payload);
        setSuccess('Inventory item updated successfully.');
      } else {
        await api.post('/inventory', payload);
        setSuccess('Inventory item created successfully.');
      }

      setModalOpen(false);
      clearForm();

      await loadInventory(selectedBranchId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item: InventoryItem) {
    const nextStatus: Status =
      item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const confirmed = window.confirm(
      `${nextStatus === 'ACTIVE' ? 'Activate' : 'Deactivate'} "${item.name}"?`
    );

    if (!confirmed) return;

    try {
      setError('');
      setSuccess('');

      await api.patch(`/inventory/${item.id}/status`, {
        status: nextStatus,
      });

      setSuccess(
        `Inventory item ${
          nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'
        } successfully.`
      );

      await loadInventory(selectedBranchId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        String(item.sku ?? '').toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === 'ALL' || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [items, search, statusFilter]);

  const stats = useMemo(() => {
    const active = items.filter((item) => item.status === 'ACTIVE');

    const lowStock = active.filter((item) => {
      const stock = Number(item.stocks?.[0]?.quantity ?? 0);
      const reorder = Number(item.reorderLevel ?? 0);

      return stock <= reorder;
    });

    const totalStockValue = active.reduce((sum, item) => {
      const quantity = Number(item.stocks?.[0]?.quantity ?? 0);
      const averageCost = Number(item.stocks?.[0]?.averageCost ?? 0);

      return sum + quantity * averageCost;
    }, 0);

    return {
      total: items.length,
      active: active.length,
      inactive: items.filter((item) => item.status === 'INACTIVE').length,
      lowStock: lowStock.length,
      totalStockValue,
    };
  }, [items]);

  if (
  employee?.role !== 'SUPER_ADMIN' &&
  employee?.role !== 'ADMIN' &&
  employee?.role !== 'MANAGER'
) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          You do not have permission to access Inventory.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-cream p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold text-coffee-dark">
              Inventory
            </h1>

            <p className="mt-1 text-sm text-coffee/60">
              Manage raw materials, stock levels and inventory items.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isSuperAdmin && (
              <select
                value={selectedBranchId}
                onChange={(event) =>
                  setSelectedBranchId(event.target.value)
                }
                className="rounded-xl border border-coffee/10 bg-white px-4 py-2.5 text-sm outline-none"
              >
                <option value="">Select branch</option>

                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-xl border border-coffee/10 bg-white px-4 py-2.5 text-sm font-semibold text-coffee-dark hover:bg-cream disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            <button
              type="button"
              onClick={openAdd}
              disabled={!selectedBranchId}
              className="rounded-xl bg-turmeric px-4 py-2.5 text-sm font-bold text-coffee-dark hover:bg-turmeric-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Add Inventory Item
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-coffee/50">Total Items</p>
            <p className="mt-1 text-2xl font-bold text-coffee-dark">
              {stats.total}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-coffee/50">Active</p>
            <p className="mt-1 text-2xl font-bold text-green-600">
              {stats.active}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-coffee/50">Inactive</p>
            <p className="mt-1 text-2xl font-bold text-gray-500">
              {stats.inactive}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-coffee/50">Low Stock</p>
            <p className="mt-1 text-2xl font-bold text-red-600">
              {stats.lowStock}
            </p>
          </div>

          <div className="col-span-2 rounded-2xl bg-white p-4 shadow-sm md:col-span-1">
            <p className="text-xs text-coffee/50">Stock Value</p>
            <p className="mt-1 text-xl font-bold text-coffee-dark">
              ₹{formatNumber(stats.totalStockValue)}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search inventory items or SKU..."
            className="flex-1 rounded-xl border border-coffee/10 bg-white px-4 py-3 text-sm outline-none focus:border-turmeric"
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'ALL' | Status)
            }
            className="rounded-xl border border-coffee/10 bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-sm text-coffee/50">
              Loading inventory...
            </div>
          ) : !selectedBranchId ? (
            <div className="p-10 text-center text-sm text-coffee/50">
              Please select a branch.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl">📦</div>

              <h3 className="mt-3 font-bold text-coffee-dark">
                No inventory items
              </h3>

              <p className="mt-1 text-sm text-coffee/50">
                Add your first raw material or stock item.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-coffee/10 text-left text-xs uppercase tracking-wide text-coffee/50">
                    <th className="px-5 py-4">Item</th>
                    <th className="px-5 py-4">SKU</th>
                    <th className="px-5 py-4">Unit</th>
                    <th className="px-5 py-4">Stock</th>
                    <th className="px-5 py-4">Reorder Level</th>
                    <th className="px-5 py-4">Avg. Cost</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map((item) => {
                    const stock = item.stocks?.[0] ?? item.stock;

                    const quantity = Number(stock?.quantity ?? 0);
                    const reorder = Number(item.reorderLevel ?? 0);

                    const lowStock =
                      item.status === 'ACTIVE' && quantity <= reorder;

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-coffee/5 last:border-0"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-coffee-dark">
                            {item.name}
                          </div>

                          {item.description && (
                            <div className="mt-1 max-w-xs truncate text-xs text-coffee/50">
                              {item.description}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-coffee/70">
                          {item.sku || '—'}
                        </td>

                        <td className="px-5 py-4 text-sm font-medium">
                          {item.unit}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={
                              lowStock
                                ? 'font-bold text-red-600'
                                : 'font-semibold text-coffee-dark'
                            }
                          >
                            {formatNumber(quantity)}
                          </span>

                          {lowStock && (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">
                              LOW
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-coffee/70">
                          {formatNumber(reorder)}
                        </td>

                        <td className="px-5 py-4 text-sm text-coffee/70">
                          ₹{formatNumber(
  stock?.averageCost ?? 0
)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              item.status === 'ACTIVE'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="rounded-lg border border-coffee/10 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => changeStatus(item)}
                              className="rounded-lg border border-coffee/10 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
                            >
                              {item.status === 'ACTIVE'
                                ? 'Deactivate'
                                : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-coffee-dark">
                  {editingItem
                    ? 'Edit Inventory Item'
                    : 'Add Inventory Item'}
                </h2>

                <p className="mt-1 text-xs text-coffee/50">
                  Branch inventory item
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg px-3 py-2 text-lg text-coffee/50 hover:bg-cream"
              >
                ×
              </button>
            </div>

            <form onSubmit={saveItem} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-coffee-dark">
                  Item Name *
                </label>

                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Example: Rice"
                  className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-coffee-dark">
                    SKU
                  </label>

                  <input
                    value={sku}
                    onChange={(event) => setSku(event.target.value)}
                    placeholder="Example: RICE-001"
                    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-coffee-dark">
                    Unit *
                  </label>

                  <select
                    value={unit}
                    onChange={(event) =>
                      setUnit(event.target.value as Unit)
                    }
                    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none"
                  >
                    {UNITS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-coffee-dark">
                  Reorder Level
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={reorderLevel}
                  onChange={(event) =>
                    setReorderLevel(event.target.value)
                  }
                  className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
                />

                <p className="mt-1 text-xs text-coffee/40">
                  A low-stock warning appears when available quantity reaches
                  this level.
                </p>
                <div>
  <label className="mb-1 block text-sm font-semibold text-coffee-dark">
    Opening Average Cost (₹)
  </label>

  <input
    type="number"
    min="0"
    step="0.01"
    value={averageCost}
    onChange={(event) =>
      setAverageCost(event.target.value)
    }
    placeholder="Example: 65.00"
    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
  />

  <p className="mt-1 text-xs text-coffee/40">
    Enter the opening cost per selected inventory unit.
  </p>
</div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-coffee-dark">
                  Description
                </label>

                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  rows={3}
                  placeholder="Optional description"
                  className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-coffee/10 px-5 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-turmeric px-5 py-2.5 text-sm font-bold text-coffee-dark hover:bg-turmeric-deep disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingItem
                    ? 'Update Item'
                    : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}