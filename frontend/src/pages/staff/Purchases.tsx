import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type Supplier = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
};

type InventoryItem = {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  status: string;
};

type PurchaseItem = {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
};

type Purchase = {
  id: string;
  purchaseNumber: number;
  invoiceNumber?: string | null;
  purchaseDate: string;
  status: 'DRAFT' | 'RECEIVED' | 'CANCELLED';
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  supplier?: Supplier;
  items?: Array<{
    id: string;
    quantity: string | number;
    unitCost: string | number;
    totalCost: string | number;
    inventoryItem?: InventoryItem;
  }>;
};

export default function Purchases() {
  const { employee } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<PurchaseItem[]>([
    {
      inventoryItemId: '',
      quantity: '1',
      unitCost: '0',
    },
  ]);

  const [selectedBranchId, setSelectedBranchId] = useState(
  () =>
    employee?.branchId ||
    localStorage.getItem('selected_branch_id') ||
    ''
);

const branchId =
  employee?.role === 'SUPER_ADMIN'
    ? selectedBranchId
    : employee?.branchId;

// Purchase history filters
const [purchaseSearch, setPurchaseSearch] = useState('');
const [purchaseSupplierFilter, setPurchaseSupplierFilter] = useState('');
const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<
  'ALL' | 'DRAFT' | 'RECEIVED' | 'CANCELLED'
>('ALL');
const [purchaseItemFilter, setPurchaseItemFilter] = useState('');
const [purchaseFromDate, setPurchaseFromDate] = useState('');
const [purchaseToDate, setPurchaseToDate] = useState('');
const [purchaseMinAmount, setPurchaseMinAmount] = useState('');
const [purchaseMaxAmount, setPurchaseMaxAmount] = useState('');
const [purchaseSort, setPurchaseSort] = useState<
  'NEWEST' | 'OLDEST' | 'HIGH_AMOUNT' | 'LOW_AMOUNT'
>('NEWEST');

useEffect(() => {
  const handleBranchChanged = (event: Event) => {
    const customEvent = event as CustomEvent<{ branchId: string }>;
    setSelectedBranchId(customEvent.detail?.branchId || '');
  };

  window.addEventListener('branchChanged', handleBranchChanged);

  return () => {
    window.removeEventListener('branchChanged', handleBranchChanged);
  };
}, []);

const loadData = async () => {
  if (!branchId) {
    setLoading(false);
    setSuppliers([]);
    setInventoryItems([]);
    setPurchases([]);
    return;
  }

    try {
      setLoading(true);

      const params =
        employee?.role === 'SUPER_ADMIN' && branchId
          ? { branchId }
          : undefined;

      const [supplierResponse, inventoryResponse, purchaseResponse] =
        await Promise.all([
          api.get('/suppliers', { params }),
          api.get('/inventory', { params }),
          api.get('/purchases', { params }),
        ]);

      const supplierData = Array.isArray(supplierResponse.data)
        ? supplierResponse.data
        : supplierResponse.data?.items ??
          supplierResponse.data?.suppliers ??
          [];

      const inventoryData = Array.isArray(inventoryResponse.data)
        ? inventoryResponse.data
        : inventoryResponse.data?.items ??
          inventoryResponse.data?.inventory ??
          [];

      const purchaseData = Array.isArray(purchaseResponse.data)
        ? purchaseResponse.data
        : purchaseResponse.data?.items ??
          purchaseResponse.data?.purchases ??
          [];

      setSuppliers(supplierData);
      setInventoryItems(inventoryData);
      setPurchases(purchaseData);
    } catch (error: any) {
      alert(error?.message || 'Failed to load purchases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [branchId, employee?.role]);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const unitCost = Number(item.unitCost) || 0;

      return sum + quantity * unitCost;
    }, 0);
  }, [items]);

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        inventoryItemId: '',
        quantity: '1',
        unitCost: '0',
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    field: keyof PurchaseItem,
    value: string
  ) => {
    setItems((current) =>
      current.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  };

  const resetForm = () => {
    setSupplierId('');
    setInvoiceNumber('');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setItems([
      {
        inventoryItemId: '',
        quantity: '1',
        unitCost: '0',
      },
    ]);
  };

  const savePurchase = async (status: 'DRAFT' | 'RECEIVED') => {
    if (!supplierId) {
      alert('Please select a supplier.');
      return;
    }

    const validItems = items.filter(
      (item) =>
        item.inventoryItemId &&
        Number(item.quantity) > 0 &&
        Number(item.unitCost) >= 0
    );

    if (validItems.length === 0) {
      alert('Please add at least one valid purchase item.');
      return;
    }

    try {
      setSaving(true);

      await api.post('/purchases', {
        supplierId,
        invoiceNumber: invoiceNumber || undefined,
        purchaseDate,
        notes: notes || undefined,
        status,
        items: validItems.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
        })),
      });

      alert(
        status === 'RECEIVED'
          ? 'Purchase received successfully.'
          : 'Purchase saved as draft.'
      );

      setShowForm(false);
      resetForm();
      await loadData();
    } catch (error: any) {
      alert(error?.message || 'Failed to save purchase.');
    } finally {
      setSaving(false);
    }
  };

  const receivePurchase = async (id: string) => {
    if (
      !window.confirm(
        'Receive this purchase? Stock quantities will be updated.'
      )
    ) {
      return;
    }

    try {
      await api.patch(`/purchases/${id}/receive`);

      alert('Purchase received and stock updated.');

      await loadData();
    } catch (error: any) {
      alert(error?.message || 'Failed to receive purchase.');
    }
  };

  const cancelPurchase = async (id: string) => {
    if (!window.confirm('Cancel this purchase?')) {
      return;
    }

    try {
      await api.patch(`/purchases/${id}/cancel`);

      alert('Purchase cancelled.');

      await loadData();
    } catch (error: any) {
      alert(error?.message || 'Failed to cancel purchase.');
    }
  };

  const filteredPurchases = useMemo(() => {
    const search = purchaseSearch.trim().toLowerCase();

    const filtered = purchases.filter((purchase) => {
      const supplierName = purchase.supplier?.name || '';
      const purchaseNumber = String(purchase.purchaseNumber || '');
      const invoiceNumber = purchase.invoiceNumber || '';

      if (
        search &&
        !purchaseNumber.toLowerCase().includes(search) &&
        !supplierName.toLowerCase().includes(search) &&
        !invoiceNumber.toLowerCase().includes(search)
      ) {
        return false;
      }

      if (
        purchaseSupplierFilter &&
        purchase.supplier?.id !== purchaseSupplierFilter
      ) {
        return false;
      }

      if (
        purchaseStatusFilter !== 'ALL' &&
        purchase.status !== purchaseStatusFilter
      ) {
        return false;
      }

      if (purchaseItemFilter) {
        const hasItem = purchase.items?.some(
          (item) => item.inventoryItem?.id === purchaseItemFilter
        );

        if (!hasItem) return false;
      }

      const purchaseDate = new Date(purchase.purchaseDate);
      const purchaseDateOnly = Number.isNaN(purchaseDate.getTime())
        ? ''
        : purchaseDate.toISOString().slice(0, 10);

      if (purchaseFromDate && purchaseDateOnly < purchaseFromDate) {
        return false;
      }

      if (purchaseToDate && purchaseDateOnly > purchaseToDate) {
        return false;
      }

      const total = Number(purchase.total || 0);

      if (
        purchaseMinAmount &&
        total < Number(purchaseMinAmount)
      ) {
        return false;
      }

      if (
        purchaseMaxAmount &&
        total > Number(purchaseMaxAmount)
      ) {
        return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (
        purchaseSort === 'HIGH_AMOUNT' ||
        purchaseSort === 'LOW_AMOUNT'
      ) {
        const amountDifference =
          Number(a.total || 0) - Number(b.total || 0);

        return purchaseSort === 'HIGH_AMOUNT'
          ? -amountDifference
          : amountDifference;
      }

      const dateA = new Date(a.purchaseDate).getTime();
      const dateB = new Date(b.purchaseDate).getTime();

      return purchaseSort === 'OLDEST'
        ? dateA - dateB
        : dateB - dateA;
    });
  }, [
    purchases,
    purchaseSearch,
    purchaseSupplierFilter,
    purchaseStatusFilter,
    purchaseItemFilter,
    purchaseFromDate,
    purchaseToDate,
    purchaseMinAmount,
    purchaseMaxAmount,
    purchaseSort,
  ]);

  const clearPurchaseFilters = () => {
    setPurchaseSearch('');
    setPurchaseSupplierFilter('');
    setPurchaseStatusFilter('ALL');
    setPurchaseItemFilter('');
    setPurchaseFromDate('');
    setPurchaseToDate('');
    setPurchaseMinAmount('');
    setPurchaseMaxAmount('');
    setPurchaseSort('NEWEST');
  };

  const setTodayPurchaseFilter = () => {
    const today = new Date().toISOString().slice(0, 10);
    setPurchaseFromDate(today);
    setPurchaseToDate(today);
  };

  const formatMoney = (value: string | number) =>
    `₹${Number(value || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-coffee-dark">
            Purchases
          </h1>

          <p className="mt-1 text-sm text-coffee/60">
            Manage suppliers, purchase invoices, receiving and inventory
            stock.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-turmeric px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
        >
          + New Purchase
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-coffee/10 bg-white p-5">
          <p className="text-sm text-coffee/50">Suppliers</p>
          <p className="mt-2 text-2xl font-bold text-coffee-dark">
            {suppliers.length}
          </p>
        </div>

        <div className="rounded-2xl border border-coffee/10 bg-white p-5">
          <p className="text-sm text-coffee/50">Purchases</p>
          <p className="mt-2 text-2xl font-bold text-coffee-dark">
            {purchases.length}
          </p>
        </div>

        <div className="rounded-2xl border border-coffee/10 bg-white p-5">
          <p className="text-sm text-coffee/50">Total Purchase Value</p>
          <p className="mt-2 text-2xl font-bold text-coffee-dark">
            {formatMoney(
              purchases.reduce(
                (sum, purchase) => sum + Number(purchase.total || 0),
                0
              )
            )}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-coffee/10 bg-white">
        <div className="border-b border-coffee/10 px-5 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-coffee-dark">
                  Purchase History
                </h2>
                <p className="mt-1 text-xs text-coffee/50">
                  Showing {filteredPurchases.length} of {purchases.length} purchases
                </p>
              </div>

              <button
                type="button"
                onClick={clearPurchaseFilters}
                className="rounded-lg border border-coffee/10 px-3 py-2 text-xs font-semibold text-coffee-dark hover:bg-coffee/5"
              >
                Clear Filters
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <input
                value={purchaseSearch}
                onChange={(event) => setPurchaseSearch(event.target.value)}
                placeholder="Search purchase # / supplier / invoice"
                className="w-full rounded-xl border border-coffee/10 px-3 py-2.5 text-sm"
              />

              <select
                value={purchaseSupplierFilter}
                onChange={(event) =>
                  setPurchaseSupplierFilter(event.target.value)
                }
                className="w-full rounded-xl border border-coffee/10 px-3 py-2.5 text-sm"
              >
                <option value="">All Suppliers</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>

              <select
                value={purchaseStatusFilter}
                onChange={(event) =>
                  setPurchaseStatusFilter(
                    event.target.value as
                      | 'ALL'
                      | 'DRAFT'
                      | 'RECEIVED'
                      | 'CANCELLED'
                  )
                }
                className="w-full rounded-xl border border-coffee/10 px-3 py-2.5 text-sm"
              >
                <option value="ALL">All Purchase Status</option>
                <option value="DRAFT">Draft</option>
                <option value="RECEIVED">Received</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                value={purchaseItemFilter}
                onChange={(event) =>
                  setPurchaseItemFilter(event.target.value)
                }
                className="w-full rounded-xl border border-coffee/10 px-3 py-2.5 text-sm"
              >
                <option value="">All Inventory Items</option>
                {inventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.sku ? ` (${item.sku})` : ''}
                  </option>
                ))}
              </select>

              <div>
                <label className="mb-1 block text-xs font-semibold text-coffee/60">
                  From Date
                </label>
                <input
                  type="date"
                  value={purchaseFromDate}
                  onChange={(event) =>
                    setPurchaseFromDate(event.target.value)
                  }
                  className="w-full rounded-xl border border-coffee/10 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-coffee/60">
                  To Date
                </label>
                <input
                  type="date"
                  value={purchaseToDate}
                  onChange={(event) =>
                    setPurchaseToDate(event.target.value)
                  }
                  className="w-full rounded-xl border border-coffee/10 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-coffee/60">
                  Min Amount
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseMinAmount}
                  onChange={(event) =>
                    setPurchaseMinAmount(event.target.value)
                  }
                  placeholder="₹0"
                  className="w-full rounded-xl border border-coffee/10 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-coffee/60">
                  Max Amount
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseMaxAmount}
                  onChange={(event) =>
                    setPurchaseMaxAmount(event.target.value)
                  }
                  placeholder="No limit"
                  className="w-full rounded-xl border border-coffee/10 px-3 py-2.5 text-sm"
                />
              </div>

              <select
                value={purchaseSort}
                onChange={(event) =>
                  setPurchaseSort(
                    event.target.value as
                      | 'NEWEST'
                      | 'OLDEST'
                      | 'HIGH_AMOUNT'
                      | 'LOW_AMOUNT'
                  )
                }
                className="w-full rounded-xl border border-coffee/10 px-3 py-2.5 text-sm"
              >
                <option value="NEWEST">Newest First</option>
                <option value="OLDEST">Oldest First</option>
                <option value="HIGH_AMOUNT">Highest Amount</option>
                <option value="LOW_AMOUNT">Lowest Amount</option>
              </select>

              <button
                type="button"
                onClick={setTodayPurchaseFilter}
                className="rounded-xl border border-coffee/10 px-3 py-2.5 text-sm font-semibold text-coffee-dark hover:bg-coffee/5"
              >
                Today
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-coffee/50">
            Loading purchases...
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-coffee/50">
              {purchases.length === 0
                ? 'No purchases found.'
                : 'No purchases match the selected filters.'}
            </p>

            {purchases.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-4 rounded-xl bg-turmeric px-4 py-2 text-sm font-semibold text-white"
              >
                Create your first purchase
              </button>
            ) : (
              <button
                type="button"
                onClick={clearPurchaseFilters}
                className="mt-4 rounded-xl border border-coffee/10 px-4 py-2 text-sm font-semibold text-coffee-dark"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-coffee/[0.03]">
                <tr>
                  <th className="px-5 py-3 font-semibold">
                    Purchase #
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Supplier
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Invoice
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Date
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Total
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Status
                  </th>
                  <th className="px-5 py-3 font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredPurchases.map((purchase) => (
                  <tr
                    key={purchase.id}
                    className="border-t border-coffee/10"
                  >
                    <td className="px-5 py-4 font-semibold">
                      #{purchase.purchaseNumber}
                    </td>

                    <td className="px-5 py-4">
                      {purchase.supplier?.name || '—'}
                    </td>

                    <td className="px-5 py-4">
                      {purchase.invoiceNumber || '—'}
                    </td>

                    <td className="px-5 py-4">
                      {new Date(
                        purchase.purchaseDate
                      ).toLocaleDateString('en-IN')}
                    </td>

                    <td className="px-5 py-4 font-semibold">
                      {formatMoney(purchase.total)}
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-coffee/5 px-3 py-1 text-xs font-semibold">
                        {purchase.status}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        {purchase.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() =>
                              receivePurchase(purchase.id)
                            }
                            className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white"
                          >
                            Receive
                          </button>
                        )}

                        {purchase.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() =>
                              cancelPurchase(purchase.id)
                            }
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-coffee/10 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-coffee-dark">
                  New Purchase
                </h2>

                <p className="text-sm text-coffee/50">
                  Create a purchase invoice and add inventory items.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="rounded-lg px-3 py-2 text-xl text-coffee/50 hover:bg-coffee/5"
              >
                ×
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Supplier
                  </label>

                  <select
                    value={supplierId}
                    onChange={(event) =>
                      setSupplierId(event.target.value)
                    }
                    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm"
                  >
                    <option value="">Select supplier</option>

                    {suppliers
                      .filter(
                        (supplier) =>
                          supplier.status === 'ACTIVE'
                      )
                      .map((supplier) => (
                        <option
                          key={supplier.id}
                          value={supplier.id}
                        >
                          {supplier.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Invoice Number
                  </label>

                  <input
                    value={invoiceNumber}
                    onChange={(event) =>
                      setInvoiceNumber(event.target.value)
                    }
                    placeholder="Supplier invoice number"
                    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Purchase Date
                  </label>

                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(event) =>
                      setPurchaseDate(event.target.value)
                    }
                    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-coffee-dark">
                    Purchase Items
                  </h3>

                  <button
                    type="button"
                    onClick={addItem}
                    className="rounded-lg bg-coffee-dark px-3 py-2 text-xs font-semibold text-white"
                  >
                    + Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((item, index) => {
                    const selectedItem = inventoryItems.find(
                      (inventoryItem) =>
                        inventoryItem.id === item.inventoryItemId
                    );

                    const lineTotal =
                      (Number(item.quantity) || 0) *
                      (Number(item.unitCost) || 0);

                    return (
                      <div
                        key={index}
                        className="grid gap-3 rounded-xl border border-coffee/10 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                      >
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-coffee/60">
                            Inventory Item
                          </label>

                          <select
                            value={item.inventoryItemId}
                            onChange={(event) =>
                              updateItem(
                                index,
                                'inventoryItemId',
                                event.target.value
                              )
                            }
                            className="w-full rounded-lg border border-coffee/10 px-3 py-2 text-sm"
                          >
                            <option value="">
                              Select item
                            </option>

                            {inventoryItems
                              .filter(
                                (inventoryItem) =>
                                  inventoryItem.status ===
                                  'ACTIVE'
                              )
                              .map((inventoryItem) => (
                                <option
                                  key={inventoryItem.id}
                                  value={inventoryItem.id}
                                >
                                  {inventoryItem.name}
                                  {inventoryItem.sku
                                    ? ` (${inventoryItem.sku})`
                                    : ''}
                                </option>
                              ))}
                          </select>

                          {selectedItem && (
                            <p className="mt-1 text-xs text-coffee/40">
                              Unit: {selectedItem.unit}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-coffee/60">
                            Quantity
                          </label>

                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={item.quantity}
                            onChange={(event) =>
                              updateItem(
                                index,
                                'quantity',
                                event.target.value
                              )
                            }
                            className="w-full rounded-lg border border-coffee/10 px-3 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-coffee/60">
                            Unit Cost
                          </label>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitCost}
                            onChange={(event) =>
                              updateItem(
                                index,
                                'unitCost',
                                event.target.value
                              )
                            }
                            className="w-full rounded-lg border border-coffee/10 px-3 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-coffee/60">
                            Total
                          </label>

                          <div className="rounded-lg bg-coffee/[0.04] px-3 py-2 text-sm font-semibold">
                            {formatMoney(lineTotal)}
                          </div>
                        </div>

                        <div className="flex items-end">
                          <button
                            type="button"
                            disabled={items.length === 1}
                            onClick={() =>
                              removeItem(index)
                            }
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Notes
                </label>

                <textarea
                  value={notes}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                  rows={3}
                  placeholder="Optional purchase notes..."
                  className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm"
                />
              </div>

              <div className="flex items-center justify-end border-t border-coffee/10 pt-5">
                <div className="text-right">
                  <p className="text-sm text-coffee/50">
                    Subtotal
                  </p>

                  <p className="text-2xl font-bold text-coffee-dark">
                    {formatMoney(subtotal)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="rounded-xl border border-coffee/10 px-5 py-3 text-sm font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => savePurchase('DRAFT')}
                  className="rounded-xl border border-coffee-dark px-5 py-3 text-sm font-semibold text-coffee-dark disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => savePurchase('RECEIVED')}
                  className="rounded-xl bg-turmeric px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving ? 'Processing...' : 'Save & Receive'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}