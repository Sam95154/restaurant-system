import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';
type CouponStatus = 'ACTIVE' | 'INACTIVE';

type Branch = {
  id: string;
  name: string;
};

type Coupon = {
  id: string;
  code: string;
  description?: string | null;
  discountType: DiscountType;
  discountValue: number | string;
  minOrder: number | string;
  maxDiscount?: number | string | null;
  startDate: string;
  expiryDate: string;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  status: CouponStatus;
  branchId?: string | null;
  branch?: Branch | null;
  _count?: {
    usages: number;
    orders: number;
  };
};

type CouponForm = {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  minOrder: string;
  maxDiscount: string;
  startDate: string;
  expiryDate: string;
  usageLimit: string;
  perCustomerLimit: string;
  branchId: string;
};

type Usage = {
  id: string;
  couponId: string;
  customerId?: string | null;
  usedAt: string;
};

const emptyForm: CouponForm = {
  code: '',
  description: '',
  discountType: 'PERCENTAGE',
  discountValue: '',
  minOrder: '0',
  maxDiscount: '',
  startDate: '',
  expiryDate: '',
  usageLimit: '',
  perCustomerLimit: '',
  branchId: '',
};

function toDateTimeLocal(value: string) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset();
  const localDate = new Date(
    date.getTime() - offset * 60 * 1000,
  );

  return localDate.toISOString().slice(0, 16);
}

function formatDate(value?: string | null) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString();
}

function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);

  return `₹${amount.toFixed(2)}`;
}

function randomCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SAVE';

  for (let i = 0; i < 6; i += 1) {
    code += chars.charAt(
      Math.floor(Math.random() * chars.length),
    );
  }

  return code;
}

function getErrorMessage(error: any) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    'Something went wrong.'
  );
}

export default function Coupons() {
  const { employee } = useAuth();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<'ALL' | CouponStatus>('ALL');
  const [branchFilter, setBranchFilter] =
    useState('ALL');

  const [showForm, setShowForm] = useState(false);
  const [editingCoupon, setEditingCoupon] =
    useState<Coupon | null>(null);

  const [form, setForm] =
    useState<CouponForm>(emptyForm);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [usageCoupon, setUsageCoupon] =
    useState<Coupon | null>(null);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [usageLoading, setUsageLoading] =
    useState(false);

  const isSuperAdmin =
    employee?.role === 'SUPER_ADMIN';

  const isManager =
    employee?.role === 'MANAGER';

  const canManage =
    isSuperAdmin || isManager;

  const loadBranches = async () => {
    try {
      const response = await api.get('/branches');

      const payload = response.data;

      const data = Array.isArray(payload)
        ? payload
        : payload?.branches ||
          payload?.data ||
          [];

      setBranches(
        data.map((branch: any) => ({
          id: branch.id,
          name: branch.name,
        })),
      );
    } catch {
      /*
       * Branch loading is non-blocking.
       * The coupon API remains usable even if
       * branch loading fails.
       */
    }
  };

  const loadCoupons = async () => {
    try {
      setLoading(true);
      setError('');

      const params: Record<string, string> = {};

      if (search.trim()) {
        params.search = search.trim();
      }

      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }

      if (branchFilter !== 'ALL') {
        params.branchId = branchFilter;
      }

      const response = await api.get(
        '/coupons',
        { params },
      );

      const payload = response.data;

      setCoupons(
        Array.isArray(payload)
          ? payload
          : payload?.coupons ||
              payload?.data ||
              [],
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadCoupons();
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    search,
    statusFilter,
    branchFilter,
  ]);

  const filteredCoupons = useMemo(
    () => coupons,
    [coupons],
  );

  const resetForm = () => {
    setForm(emptyForm);
    setEditingCoupon(null);
    setShowForm(false);
  };

  const updateForm = (
    field: keyof CouponForm,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const openCreateForm = () => {
    const now = new Date();

    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);

    setEditingCoupon(null);

    setForm({
      ...emptyForm,
      code: randomCouponCode(),
      startDate: toDateTimeLocal(
        now.toISOString(),
      ),
      expiryDate: toDateTimeLocal(
        expiry.toISOString(),
      ),
      branchId:
        isManager && employee?.branchId
          ? employee.branchId
          : '',
    });

    setError('');
    setSuccess('');
    setShowForm(true);
  };

  const openEditForm = (coupon: Coupon) => {
    setEditingCoupon(coupon);

    setForm({
      code: coupon.code || '',
      description:
        coupon.description || '',
      discountType:
        coupon.discountType,
      discountValue:
        String(coupon.discountValue ?? ''),
      minOrder:
        String(coupon.minOrder ?? '0'),
      maxDiscount:
        coupon.maxDiscount == null
          ? ''
          : String(coupon.maxDiscount),
      startDate: toDateTimeLocal(
        coupon.startDate,
      ),
      expiryDate: toDateTimeLocal(
        coupon.expiryDate,
      ),
      usageLimit:
        coupon.usageLimit == null
          ? ''
          : String(coupon.usageLimit),
      perCustomerLimit:
        coupon.perCustomerLimit == null
          ? ''
          : String(coupon.perCustomerLimit),
      branchId:
        coupon.branchId || '',
    });

    setError('');
    setSuccess('');
    setShowForm(true);
  };

  const handleSave = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      if (!form.code.trim()) {
        throw new Error(
          'Coupon code is required.',
        );
      }

      const discountValue =
        Number(form.discountValue);

      if (
        !Number.isFinite(discountValue) ||
        discountValue <= 0
      ) {
        throw new Error(
          'Enter a valid discount value.',
        );
      }

      if (
        form.discountType === 'PERCENTAGE' &&
        discountValue > 100
      ) {
        throw new Error(
          'Percentage discount cannot exceed 100%.',
        );
      }

      if (!form.startDate || !form.expiryDate) {
        throw new Error(
          'Start date and expiry date are required.',
        );
      }

      if (
        new Date(form.expiryDate) <=
        new Date(form.startDate)
      ) {
        throw new Error(
          'Expiry date must be later than start date.',
        );
      }

      const body: Record<string, any> = {
        code: form.code
          .trim()
          .toUpperCase(),
        description:
          form.description.trim() || undefined,
        discountType:
          form.discountType,
        discountValue,
        minOrder:
          Number(form.minOrder || 0),
        startDate:
          new Date(
            form.startDate,
          ).toISOString(),
        expiryDate:
          new Date(
            form.expiryDate,
          ).toISOString(),
        usageLimit:
          form.usageLimit.trim()
            ? Number(form.usageLimit)
            : undefined,
        perCustomerLimit:
          form.perCustomerLimit.trim()
            ? Number(form.perCustomerLimit)
            : undefined,
      };

      if (form.maxDiscount.trim()) {
        body.maxDiscount =
          Number(form.maxDiscount);
      }

      if (form.branchId) {
        body.branchId = form.branchId;
      }

      if (editingCoupon) {
        await api.put(
          `/coupons/${editingCoupon.id}`,
          body,
        );

        setSuccess(
          'Coupon updated successfully.',
        );
      } else {
        await api.post(
          '/coupons',
          body,
        );

        setSuccess(
          'Coupon created successfully.',
        );
      }

      resetForm();
      await loadCoupons();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (
    coupon: Coupon,
  ) => {
    try {
      setError('');
      setSuccess('');

      const nextStatus =
        coupon.status === 'ACTIVE'
          ? 'INACTIVE'
          : 'ACTIVE';

      await api.patch(
        `/coupons/${coupon.id}/status`,
        {
          status: nextStatus,
        },
      );

      setSuccess(
        `Coupon ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully.`,
      );

      await loadCoupons();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const deleteCoupon = async (
    coupon: Coupon,
  ) => {
    const confirmed =
      window.confirm(
        `Delete coupon "${coupon.code}"?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      await api.delete(
        `/coupons/${coupon.id}`,
      );

      setSuccess(
        'Coupon deleted successfully.',
      );

      await loadCoupons();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const openUsage = async (
    coupon: Coupon,
  ) => {
    try {
      setUsageCoupon(coupon);
      setUsage([]);
      setUsageLoading(true);
      setError('');

      const response = await api.get(
        `/coupons/${coupon.id}/usage`,
      );

      const payload = response.data;

      setUsage(
        Array.isArray(payload)
          ? payload
          : payload?.usages ||
              payload?.data?.usages ||
              [],
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUsageLoading(false);
    }
  };

  if (!canManage) {
    return (
      <div
        style={{
          padding: 24,
          color: '#b91c1c',
        }}
      >
        You do not have permission to manage
        coupons.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1500,
        margin: '0 auto',
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            Coupons
          </h1>

          <p
            style={{
              margin:
                '6px 0 0',
              color: '#64748b',
            }}
          >
            Create and manage restaurant
            discount coupons.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          style={{
            border: 'none',
            borderRadius: 8,
            padding:
              '11px 18px',
            background:
              '#111827',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Create Coupon
        </button>
      </div>

      {/* MESSAGES */}

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: '#fee2e2',
            color: '#991b1b',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: '#dcfce7',
            color: '#166534',
          }}
        >
          {success}
        </div>
      )}

      {/* FILTERS */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(220px, 1fr) 180px 220px auto',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <input
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Search coupon code..."
          style={{
            padding: 11,
            border:
              '1px solid #d1d5db',
            borderRadius: 8,
          }}
        />

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as
                | 'ALL'
                | CouponStatus,
            )
          }
          style={{
            padding: 11,
            border:
              '1px solid #d1d5db',
            borderRadius: 8,
          }}
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

        <select
          value={branchFilter}
          onChange={(event) =>
            setBranchFilter(
              event.target.value,
            )
          }
          style={{
            padding: 11,
            border:
              '1px solid #d1d5db',
            borderRadius: 8,
          }}
        >
          <option value="ALL">
            All Branches
          </option>

          {branches.map((branch) => (
            <option
              key={branch.id}
              value={branch.id}
            >
              {branch.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={loadCoupons}
          style={{
            padding:
              '10px 16px',
            border:
              '1px solid #d1d5db',
            borderRadius: 8,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {/* TABLE */}

      <div
        style={{
          overflowX: 'auto',
          border:
            '1px solid #e5e7eb',
          borderRadius: 10,
          background: '#fff',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse:
              'collapse',
            minWidth: 1100,
          }}
        >
          <thead>
            <tr
              style={{
                background:
                  '#f8fafc',
                textAlign: 'left',
              }}
            >
              <th style={{ padding: 12 }}>
                Code
              </th>

              <th style={{ padding: 12 }}>
                Discount
              </th>

              <th style={{ padding: 12 }}>
                Minimum Order
              </th>

              <th style={{ padding: 12 }}>
                Validity
              </th>

              <th style={{ padding: 12 }}>
                Branch
              </th>

              <th style={{ padding: 12 }}>
                Usage
              </th>

              <th style={{ padding: 12 }}>
                Status
              </th>

              <th style={{ padding: 12 }}>
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: 30,
                    textAlign: 'center',
                  }}
                >
                  Loading coupons...
                </td>
              </tr>
            ) : filteredCoupons.length ===
              0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: 30,
                    textAlign: 'center',
                    color:
                      '#64748b',
                  }}
                >
                  No coupons found.
                </td>
              </tr>
            ) : (
              filteredCoupons.map(
                (coupon) => (
                  <tr
                    key={coupon.id}
                    style={{
                      borderTop:
                        '1px solid #e5e7eb',
                    }}
                  >
                    <td
                      style={{
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                        }}
                      >
                        {coupon.code}
                      </div>

                      {coupon.description && (
                        <div
                          style={{
                            fontSize: 12,
                            color:
                              '#64748b',
                            marginTop: 3,
                          }}
                        >
                          {
                            coupon.description
                          }
                        </div>
                      )}
                    </td>

                    <td
                      style={{
                        padding: 12,
                      }}
                    >
                      {coupon.discountType ===
                      'PERCENTAGE'
                        ? `${coupon.discountValue}%`
                        : money(
                            coupon.discountValue,
                          )}

                      {coupon.maxDiscount !=
                        null &&
                        coupon.discountType ===
                          'PERCENTAGE' && (
                          <div
                            style={{
                              fontSize: 12,
                              color:
                                '#64748b',
                            }}
                          >
                            Max{' '}
                            {money(
                              coupon.maxDiscount,
                            )}
                          </div>
                        )}
                    </td>

                    <td
                      style={{
                        padding: 12,
                      }}
                    >
                      {money(
                        coupon.minOrder,
                      )}
                    </td>

                    <td
                      style={{
                        padding: 12,
                        fontSize: 13,
                      }}
                    >
                      <div>
                        {formatDate(
                          coupon.startDate,
                        )}
                      </div>
                      <div>
                        →
                      </div>
                      <div>
                        {formatDate(
                          coupon.expiryDate,
                        )}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: 12,
                      }}
                    >
                      {coupon.branch?.name ||
                        'All Branches'}
                    </td>

                    <td
                      style={{
                        padding: 12,
                      }}
                    >
                      {coupon._count?.usages ??
                        0}

                      {coupon.usageLimit !=
                        null && (
                        <>
                          {' / '}
                          {
                            coupon.usageLimit
                          }
                        </>
                      )}
                    </td>

                    <td
                      style={{
                        padding: 12,
                      }}
                    >
                      <span
                        style={{
                          display:
                            'inline-block',
                          padding:
                            '4px 9px',
                          borderRadius:
                            999,
                          fontSize: 12,
                          fontWeight: 600,
                          background:
                            coupon.status ===
                            'ACTIVE'
                              ? '#dcfce7'
                              : '#f1f5f9',
                          color:
                            coupon.status ===
                            'ACTIVE'
                              ? '#166534'
                              : '#475569',
                        }}
                      >
                        {coupon.status}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          display:
                            'flex',
                          gap: 6,
                          flexWrap:
                            'wrap',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            openEditForm(
                              coupon,
                            )
                          }
                          style={{
                            padding:
                              '6px 9px',
                            border:
                              '1px solid #d1d5db',
                            borderRadius:
                              6,
                            background:
                              '#fff',
                            cursor:
                              'pointer',
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            toggleStatus(
                              coupon,
                            )
                          }
                          style={{
                            padding:
                              '6px 9px',
                            border:
                              '1px solid #d1d5db',
                            borderRadius:
                              6,
                            background:
                              '#fff',
                            cursor:
                              'pointer',
                          }}
                        >
                          {coupon.status ===
                          'ACTIVE'
                            ? 'Deactivate'
                            : 'Activate'}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openUsage(
                              coupon,
                            )
                          }
                          style={{
                            padding:
                              '6px 9px',
                            border:
                              '1px solid #d1d5db',
                            borderRadius:
                              6,
                            background:
                              '#fff',
                            cursor:
                              'pointer',
                          }}
                        >
                          Usage
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            deleteCoupon(
                              coupon,
                            )
                          }
                          style={{
                            padding:
                              '6px 9px',
                            border:
                              '1px solid #fecaca',
                            borderRadius:
                              6,
                            background:
                              '#fff',
                            color:
                              '#b91c1c',
                            cursor:
                              'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE / EDIT MODAL */}

      {showForm && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15, 23, 42, 0.45)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 760,
              maxHeight:
                '90vh',
              overflowY:
                'auto',
              background:
                '#fff',
              borderRadius:
                12,
              padding: 24,
              boxShadow:
                '0 20px 50px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  margin: 0,
                }}
              >
                {editingCoupon
                  ? 'Edit Coupon'
                  : 'Create Coupon'}
              </h2>

              <button
                type="button"
                onClick={
                  resetForm
                }
                style={{
                  border:
                    'none',
                  background:
                    'transparent',
                  fontSize: 24,
                  cursor:
                    'pointer',
                }}
              >
                ×
              </button>
            </div>

            <form
              onSubmit={
                handleSave
              }
            >
              <div
                style={{
                  display:
                    'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: 14,
                }}
              >
                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Coupon Code
                  </div>

                  <div
                    style={{
                      display:
                        'flex',
                      gap: 6,
                    }}
                  >
                    <input
                      value={
                        form.code
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          'code',
                          event
                            .target
                            .value
                            .toUpperCase(),
                        )
                      }
                      placeholder="SAVE10"
                      style={{
                        flex: 1,
                        padding: 10,
                        border:
                          '1px solid #d1d5db',
                        borderRadius:
                          7,
                      }}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        updateForm(
                          'code',
                          randomCouponCode(),
                        )
                      }
                      style={{
                        padding:
                          '8px 10px',
                        border:
                          '1px solid #d1d5db',
                        borderRadius:
                          7,
                        background:
                          '#f8fafc',
                        cursor:
                          'pointer',
                      }}
                    >
                      Generate
                    </button>
                  </div>
                </label>

                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Branch
                  </div>

                  <select
                    value={
                      form.branchId
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'branchId',
                        event
                          .target
                          .value,
                      )
                    }
                    disabled={
                      isManager
                    }
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                      background:
                        isManager
                          ? '#f1f5f9'
                          : '#fff',
                    }}
                  >
                    <option value="">
                      All Branches
                    </option>

                    {branches.map(
                      (
                        branch,
                      ) => (
                        <option
                          key={
                            branch.id
                          }
                          value={
                            branch.id
                          }
                        >
                          {
                            branch.name
                          }
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label
                  style={{
                    gridColumn:
                      '1 / -1',
                  }}
                >
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Description
                  </div>

                  <textarea
                    value={
                      form.description
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'description',
                        event
                          .target
                          .value,
                      )
                    }
                    rows={3}
                    placeholder="Describe this coupon..."
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                      resize:
                        'vertical',
                    }}
                  />
                </label>

                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Discount Type
                  </div>

                  <select
                    value={
                      form.discountType
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'discountType',
                        event
                          .target
                          .value as DiscountType,
                      )
                    }
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                    }}
                  >
                    <option value="PERCENTAGE">
                      Percentage
                    </option>
                    <option value="FIXED_AMOUNT">
                      Fixed Amount
                    </option>
                  </select>
                </label>

                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Discount Value
                  </div>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.discountValue
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'discountValue',
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder={
                      form.discountType ===
                      'PERCENTAGE'
                        ? '10'
                        : '100'
                    }
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                    }}
                  />
                </label>

                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Minimum Order
                  </div>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.minOrder
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'minOrder',
                        event
                          .target
                          .value,
                      )
                    }
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                    }}
                  />
                </label>

                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Maximum Discount
                  </div>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.maxDiscount
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'maxDiscount',
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Optional"
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                    }}
                  />
                </label>

                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Start Date
                  </div>

                  <input
                    type="datetime-local"
                    value={
                      form.startDate
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'startDate',
                        event
                          .target
                          .value,
                      )
                    }
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                    }}
                  />
                </label>

                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Expiry Date
                  </div>

                  <input
                    type="datetime-local"
                    value={
                      form.expiryDate
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'expiryDate',
                        event
                          .target
                          .value,
                      )
                    }
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                    }}
                  />
                </label>

                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Usage Limit
                  </div>

                  <input
                    type="number"
                    min="1"
                    value={
                      form.usageLimit
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'usageLimit',
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Unlimited"
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                    }}
                  />
                </label>

                <label>
                  <div
                    style={{
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    Per Customer Limit
                  </div>

                  <input
                    type="number"
                    min="1"
                    value={
                      form.perCustomerLimit
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        'perCustomerLimit',
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Unlimited"
                    style={{
                      width:
                        '100%',
                      padding: 10,
                      border:
                        '1px solid #d1d5db',
                      borderRadius:
                        7,
                    }}
                  />
                </label>
              </div>

              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'flex-end',
                  gap: 10,
                  marginTop: 24,
                }}
              >
                <button
                  type="button"
                  onClick={
                    resetForm
                  }
                  style={{
                    padding:
                      '10px 18px',
                    border:
                      '1px solid #d1d5db',
                    borderRadius:
                      7,
                    background:
                      '#fff',
                    cursor:
                      'pointer',
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    saving
                  }
                  style={{
                    padding:
                      '10px 18px',
                    border:
                      'none',
                    borderRadius:
                      7,
                    background:
                      '#111827',
                    color:
                      '#fff',
                    fontWeight:
                      600,
                    cursor:
                      saving
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {saving
                    ? 'Saving...'
                    : editingCoupon
                      ? 'Update Coupon'
                      : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* USAGE MODAL */}

      {usageCoupon && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15, 23, 42, 0.45)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding: 20,
            zIndex: 1100,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              maxHeight:
                '85vh',
              overflowY:
                'auto',
              background:
                '#fff',
              borderRadius:
                12,
              padding: 24,
            }}
          >
            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
                marginBottom: 20,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                  }}
                >
                  Coupon Usage
                </h2>

                <div
                  style={{
                    marginTop: 5,
                    color:
                      '#64748b',
                  }}
                >
                  {usageCoupon.code}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setUsageCoupon(
                    null,
                  )
                }
                style={{
                  border:
                    'none',
                  background:
                    'transparent',
                  fontSize: 24,
                  cursor:
                    'pointer',
                }}
              >
                ×
              </button>
            </div>

            {usageLoading ? (
              <div
                style={{
                  padding: 30,
                  textAlign:
                    'center',
                }}
              >
                Loading usage history...
              </div>
            ) : usage.length === 0 ? (
              <div
                style={{
                  padding: 30,
                  textAlign:
                    'center',
                  color:
                    '#64748b',
                }}
              >
                No usage history found.
              </div>
            ) : (
              <table
                style={{
                  width:
                    '100%',
                  borderCollapse:
                    'collapse',
                }}
              >
                <thead>
                  <tr
                    style={{
                      textAlign:
                        'left',
                      background:
                        '#f8fafc',
                    }}
                  >
                    <th
                      style={{
                        padding: 10,
                      }}
                    >
                      Customer ID
                    </th>

                    <th
                      style={{
                        padding: 10,
                      }}
                    >
                      Used At
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {usage.map(
                    (record) => (
                      <tr
                        key={
                          record.id
                        }
                        style={{
                          borderTop:
                            '1px solid #e5e7eb',
                        }}
                      >
                        <td
                          style={{
                            padding: 10,
                          }}
                        >
                          {record.customerId ||
                            'Guest'}
                        </td>

                        <td
                          style={{
                            padding: 10,
                          }}
                        >
                          {formatDate(
                            record.usedAt,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}