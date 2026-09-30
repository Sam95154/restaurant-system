import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type Supplier = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  branchId: string;
  createdAt?: string;
  updatedAt?: string;
};

type SupplierForm = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  gstNumber: string;
};

const SELECTED_BRANCH_KEY = 'selected_branch_id';

export default function Suppliers() {
  const { employee } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedBranchId, setSelectedBranchId] = useState(
    () =>
      employee?.branchId ||
      localStorage.getItem(SELECTED_BRANCH_KEY) ||
      ''
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'INACTIVE'
  >('ALL');

  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] =
    useState<Supplier | null>(null);

  const [form, setForm] = useState<SupplierForm>({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
  });

  const isSuperAdmin = employee?.role === 'SUPER_ADMIN';

  const branchId = isSuperAdmin
    ? selectedBranchId
    : employee?.branchId || '';

  useEffect(() => {
    const handleBranchChanged = (event: Event) => {
      const customEvent =
        event as CustomEvent<{ branchId: string }>;

      setSelectedBranchId(
        customEvent.detail?.branchId || ''
      );
    };

    window.addEventListener(
      'branchChanged',
      handleBranchChanged
    );

    return () => {
      window.removeEventListener(
        'branchChanged',
        handleBranchChanged
      );
    };
  }, []);

  const loadSuppliers = async () => {
    if (!branchId) {
      setSuppliers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const response = await api.get('/suppliers', {
        params: {
          branchId,
        },
      });

      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.items ??
          response.data?.suppliers ??
          [];

      setSuppliers(data);
    } catch (error: any) {
      console.error(
        'Failed to load suppliers:',
        error
      );

      alert(
        error?.response?.data?.message ||
          error?.message ||
          'Failed to load suppliers.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [branchId]);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return suppliers.filter((supplier) => {
      const matchesSearch =
        !query ||
        supplier.name.toLowerCase().includes(query) ||
        supplier.contactName
          ?.toLowerCase()
          .includes(query) ||
        supplier.phone
          ?.toLowerCase()
          .includes(query) ||
        supplier.email
          ?.toLowerCase()
          .includes(query) ||
        supplier.gstNumber
          ?.toLowerCase()
          .includes(query);

      const matchesStatus =
        statusFilter === 'ALL' ||
        supplier.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [suppliers, search, statusFilter]);

  const activeCount = suppliers.filter(
    (supplier) => supplier.status === 'ACTIVE'
  ).length;

  const inactiveCount = suppliers.filter(
    (supplier) => supplier.status === 'INACTIVE'
  ).length;

  const resetForm = () => {
    setForm({
      name: '',
      contactName: '',
      phone: '',
      email: '',
      address: '',
      gstNumber: '',
    });

    setEditingSupplier(null);
  };

  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (supplier: Supplier) => {
    setEditingSupplier(supplier);

    setForm({
      name: supplier.name || '',
      contactName: supplier.contactName || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      gstNumber: supplier.gstNumber || '',
    });

    setShowForm(true);
  };

  const updateForm = (
    field: keyof SupplierForm,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveSupplier = async () => {
    if (!branchId) {
      alert(
        'Please select a branch before adding a supplier.'
      );
      return;
    }

    if (!form.name.trim()) {
      alert('Supplier name is required.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: form.name.trim(),
        contactName:
          form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        gstNumber:
          form.gstNumber.trim() || undefined,
        branchId,
      };

      if (editingSupplier) {
        await api.put(
          `/suppliers/${editingSupplier.id}`,
          payload
        );

        alert('Supplier updated successfully.');
      } else {
        await api.post('/suppliers', payload);

        alert('Supplier created successfully.');
      }

      setShowForm(false);
      resetForm();

      await loadSuppliers();
    } catch (error: any) {
      console.error(
        'Failed to save supplier:',
        error
      );

      alert(
        error?.response?.data?.message ||
          error?.message ||
          'Failed to save supplier.'
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (
    supplier: Supplier
  ) => {
    const nextStatus =
      supplier.status === 'ACTIVE'
        ? 'INACTIVE'
        : 'ACTIVE';

    const confirmed = window.confirm(
      `${nextStatus === 'ACTIVE' ? 'Activate' : 'Deactivate'} ${supplier.name}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.patch(
        `/suppliers/${supplier.id}/status`,
        {
          status: nextStatus,
        }
      );

      await loadSuppliers();
    } catch (error: any) {
      console.error(
        'Failed to update supplier status:',
        error
      );

      alert(
        error?.response?.data?.message ||
          error?.message ||
          'Failed to update supplier status.'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-coffee-dark">
            Suppliers
          </h1>

          <p className="mt-1 text-sm text-coffee/60">
            Manage suppliers, contacts and supplier
            information for your branch.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          disabled={!branchId}
          className="rounded-xl bg-turmeric px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add Supplier
        </button>
      </div>

      {/* Branch warning */}
      {!branchId && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-semibold text-amber-800">
            Select a branch first
          </p>

          <p className="mt-1 text-sm text-amber-700">
            Select a branch from the top header before
            creating or viewing suppliers.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-coffee/10 bg-white p-5">
          <p className="text-sm text-coffee/50">
            Total Suppliers
          </p>

          <p className="mt-2 text-2xl font-bold text-coffee-dark">
            {suppliers.length}
          </p>
        </div>

        <div className="rounded-2xl border border-coffee/10 bg-white p-5">
          <p className="text-sm text-coffee/50">
            Active
          </p>

          <p className="mt-2 text-2xl font-bold text-green-700">
            {activeCount}
          </p>
        </div>

        <div className="rounded-2xl border border-coffee/10 bg-white p-5">
          <p className="text-sm text-coffee/50">
            Inactive
          </p>

          <p className="mt-2 text-2xl font-bold text-red-600">
            {inactiveCount}
          </p>
        </div>
      </div>

      {/* Supplier list */}
      <div className="overflow-hidden rounded-2xl border border-coffee/10 bg-white">
        <div className="flex flex-col gap-3 border-b border-coffee/10 p-5 md:flex-row md:items-center md:justify-between">
          <h2 className="font-bold text-coffee-dark">
            Supplier List
          </h2>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search suppliers..."
              className="rounded-xl border border-coffee/10 px-4 py-2 text-sm outline-none focus:border-turmeric"
            />

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | 'ALL'
                    | 'ACTIVE'
                    | 'INACTIVE'
                )
              }
              className="rounded-xl border border-coffee/10 px-4 py-2 text-sm outline-none"
            >
              <option value="ALL">
                All Status
              </option>

              <option value="ACTIVE">
                Active
              </option>

              <option value="INACTIVE">
                Inactive
              </option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-coffee/50">
            Loading suppliers...
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-coffee/50">
              {branchId
                ? 'No suppliers found.'
                : 'Select a branch to view suppliers.'}
            </p>

            {branchId && (
              <button
                type="button"
                onClick={openAddForm}
                className="mt-4 rounded-xl bg-turmeric px-4 py-2 text-sm font-semibold text-white"
              >
                + Add First Supplier
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-coffee/[0.03]">
                <tr>
                  <th className="px-5 py-3 font-semibold">
                    Supplier
                  </th>

                  <th className="px-5 py-3 font-semibold">
                    Contact
                  </th>

                  <th className="px-5 py-3 font-semibold">
                    Phone
                  </th>

                  <th className="px-5 py-3 font-semibold">
                    Email
                  </th>

                  <th className="px-5 py-3 font-semibold">
                    GST Number
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
                {filteredSuppliers.map(
                  (supplier) => (
                    <tr
                      key={supplier.id}
                      className="border-t border-coffee/10"
                    >
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold text-coffee-dark">
                            {supplier.name}
                          </p>

                          {supplier.address && (
                            <p className="mt-1 max-w-xs truncate text-xs text-coffee/50">
                              {supplier.address}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {supplier.contactName ||
                          '—'}
                      </td>

                      <td className="px-5 py-4">
                        {supplier.phone || '—'}
                      </td>

                      <td className="px-5 py-4">
                        {supplier.email || '—'}
                      </td>

                      <td className="px-5 py-4">
                        {supplier.gstNumber || '—'}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            supplier.status ===
                            'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {supplier.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditForm(
                                supplier
                              )
                            }
                            className="rounded-lg border border-coffee/10 px-3 py-2 text-xs font-semibold text-coffee-dark hover:bg-cream"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              toggleStatus(
                                supplier
                              )
                            }
                            className={`rounded-lg px-3 py-2 text-xs font-semibold text-white ${
                              supplier.status ===
                              'ACTIVE'
                                ? 'bg-red-600'
                                : 'bg-green-600'
                            }`}
                          >
                            {supplier.status ===
                            'ACTIVE'
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supplier Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-coffee/10 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-coffee-dark">
                  {editingSupplier
                    ? 'Edit Supplier'
                    : 'Add Supplier'}
                </h2>

                <p className="mt-1 text-sm text-coffee/50">
                  Enter the supplier's business and
                  contact information.
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

            <div className="space-y-5 p-6">
              {/* Supplier name */}
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Supplier Name *
                </label>

                <input
                  value={form.name}
                  onChange={(event) =>
                    updateForm(
                      'name',
                      event.target.value
                    )
                  }
                  placeholder="Example: ABC Foods Pvt Ltd"
                  className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
                />
              </div>

              {/* Contact details */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Contact Person
                  </label>

                  <input
                    value={form.contactName}
                    onChange={(event) =>
                      updateForm(
                        'contactName',
                        event.target.value
                      )
                    }
                    placeholder="Contact person's name"
                    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Phone Number
                  </label>

                  <input
                    value={form.phone}
                    onChange={(event) =>
                      updateForm(
                        'phone',
                        event.target.value
                      )
                    }
                    placeholder="9876543210"
                    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Email
                  </label>

                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateForm(
                        'email',
                        event.target.value
                      )
                    }
                    placeholder="supplier@example.com"
                    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    GST Number
                  </label>

                  <input
                    value={form.gstNumber}
                    onChange={(event) =>
                      updateForm(
                        'gstNumber',
                        event.target.value.toUpperCase()
                      )
                    }
                    placeholder="22AAAAA0000A1Z5"
                    className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm uppercase outline-none focus:border-turmeric"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Address
                </label>

                <textarea
                  value={form.address}
                  onChange={(event) =>
                    updateForm(
                      'address',
                      event.target.value
                    )
                  }
                  rows={4}
                  placeholder="Supplier business address..."
                  className="w-full rounded-xl border border-coffee/10 px-4 py-3 text-sm outline-none focus:border-turmeric"
                />
              </div>

              {/* Branch */}
              <div className="rounded-xl bg-cream/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-coffee/50">
                  Assigned Branch
                </p>

                <p className="mt-1 text-sm font-semibold text-coffee-dark">
                  {branchId
                    ? 'Selected branch'
                    : 'No branch selected'}
                </p>

                <p className="mt-1 text-xs text-coffee/50">
                  Suppliers are automatically associated
                  with the selected branch.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex flex-col-reverse gap-3 border-t border-coffee/10 pt-5 sm:flex-row sm:justify-end">
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
                  onClick={saveSupplier}
                  className="rounded-xl bg-turmeric px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingSupplier
                    ? 'Update Supplier'
                    : 'Save Supplier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}