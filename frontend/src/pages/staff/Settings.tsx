import React, { useEffect, useMemo, useState } from 'react';
import StaffLayout from '../../components/layout/StaffLayout';
import { api, API_BASE_URL } from '../../api/client';

type Role =
  | 'SUPER_ADMIN'
  | 'MANAGER'
  | 'SERVICE_EMPLOYEE'
  | 'KITCHEN_EMPLOYEE'
  | 'BILLING_EMPLOYEE';

interface Employee {
  id: string;
  fullName: string;
  role: Role;
  branchId: string | null;
}

interface Branch {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  openingTime: string;
  closingTime: string;
  weeklyHoliday: string | null;
  status: string;
  logoUrl: string | null;
}

interface RestaurantSettings {
  id: string | null;
  branchId: string;
  taxEnabled: boolean;
  taxRate: string | number;
  currency: string;
  receiptFooter: string | null;
  billPrefix: string | null;
  qrOrderingEnabled: boolean;
}

interface SettingsResponse {
  branch: Branch;
  settings: RestaurantSettings;
}

type SettingsSection =
  | 'restaurant'
  | 'billing'
  | 'qr'
  | 'logo';

const API_ROOT = API_BASE_URL.replace(/\/api\/?$/, '');

function getStoredEmployee(): Employee | null {
  try {
    const raw = localStorage.getItem('employee');

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as Employee;
  } catch {
    return null;
  }
}

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export default function Settings() {
  const employee = useMemo(
    () => getStoredEmployee(),
    [],
  );

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] =
    useState('');

  const [branch, setBranch] =
    useState<Branch | null>(null);

  const [settings, setSettings] =
    useState<RestaurantSettings | null>(null);

  const [activeSection, setActiveSection] =
    useState<SettingsSection>('restaurant');

  const [loadingBranches, setLoadingBranches] =
    useState(true);

  const [loading, setLoading] = useState(false);

  const [savingBranch, setSavingBranch] =
    useState(false);

  const [savingSettings, setSavingSettings] =
    useState(false);

  const [uploadingLogo, setUploadingLogo] =
    useState(false);

  const [deletingLogo, setDeletingLogo] =
    useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [logoPreview, setLogoPreview] =
    useState<string | null>(null);

  const [branchForm, setBranchForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    country: '',
    phone: '',
    email: '',
    openingTime: '',
    closingTime: '',
    weeklyHoliday: '',
  });

  const [settingsForm, setSettingsForm] =
    useState({
      taxEnabled: true,
      taxRate: '0',
      currency: 'INR',
      receiptFooter: '',
      billPrefix: '',
      qrOrderingEnabled: true,
    });

  const isSuperAdmin =
    employee?.role === 'SUPER_ADMIN';

  const isManager =
    employee?.role === 'MANAGER';

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (!selectedBranchId) {
      return;
    }

    loadSettings(selectedBranchId);
  }, [selectedBranchId]);

  async function loadBranches() {
    setLoadingBranches(true);
    setError('');

    try {
      const response = await api.get('/branches');

      const loadedBranches =
        (response.data?.branches ??
          response.data ??
          []) as Branch[];

      setBranches(loadedBranches);

      if (isManager && employee?.branchId) {
        setSelectedBranchId(employee.branchId);
      } else if (loadedBranches.length > 0) {
        setSelectedBranchId(loadedBranches[0].id);
      }
    } catch (err: any) {
      console.error(err);

      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Failed to load branches.',
      );
    } finally {
      setLoadingBranches(false);
    }
  }

  async function loadSettings(branchId: string) {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response =
        await api.get<SettingsResponse>(
          `/settings/${branchId}`,
        );

      const loadedBranch = response.data.branch;
      const loadedSettings =
        response.data.settings;

      setBranch(loadedBranch);
      setSettings(loadedSettings);

      setBranchForm({
        name: loadedBranch.name ?? '',
        address: loadedBranch.address ?? '',
        city: loadedBranch.city ?? '',
        state: loadedBranch.state ?? '',
        country: loadedBranch.country ?? '',
        phone: loadedBranch.phone ?? '',
        email: loadedBranch.email ?? '',
        openingTime:
          loadedBranch.openingTime ?? '',
        closingTime:
          loadedBranch.closingTime ?? '',
        weeklyHoliday:
          loadedBranch.weeklyHoliday ?? '',
      });

      setSettingsForm({
        taxEnabled:
          loadedSettings.taxEnabled,
        taxRate:
          String(loadedSettings.taxRate ?? '0'),
        currency:
          loadedSettings.currency ?? 'INR',
        receiptFooter:
          loadedSettings.receiptFooter ?? '',
        billPrefix:
          loadedSettings.billPrefix ?? '',
        qrOrderingEnabled:
          loadedSettings.qrOrderingEnabled,
      });

      setLogoPreview(null);
    } catch (err: any) {
      console.error(err);

      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Failed to load settings.',
      );
    } finally {
      setLoading(false);
    }
  }

  function updateBranchField(
    field: keyof typeof branchForm,
    value: string,
  ) {
    setBranchForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateSettingsField(
    field: keyof typeof settingsForm,
    value: string | boolean,
  ) {
    setSettingsForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveBranchInformation() {
    if (!selectedBranchId) {
      return;
    }

    setSavingBranch(true);
    setError('');
    setMessage('');

    try {
      const response =
        await api.put(
          `/settings/${selectedBranchId}/branch`,
          {
            ...branchForm,
            weeklyHoliday:
              branchForm.weeklyHoliday || null,
          },
        );

      setBranch(response.data.branch);

      setMessage(
        'Restaurant information saved successfully.',
      );
    } catch (err: any) {
      console.error(err);

      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Failed to save restaurant information.',
      );
    } finally {
      setSavingBranch(false);
    }
  }

  async function saveSettings() {
    if (!selectedBranchId) {
      return;
    }

    setSavingSettings(true);
    setError('');
    setMessage('');

    try {
      const response =
        await api.put(
          `/settings/${selectedBranchId}`,
          {
            taxEnabled:
              settingsForm.taxEnabled,

            taxRate:
              Number(settingsForm.taxRate || 0),

            currency:
              settingsForm.currency,

            receiptFooter:
              settingsForm.receiptFooter || null,

            billPrefix:
              settingsForm.billPrefix || null,

            qrOrderingEnabled:
              settingsForm.qrOrderingEnabled,
          },
        );

      setSettings(response.data.settings);

      setMessage(
        'Restaurant settings saved successfully.',
      );
    } catch (err: any) {
      console.error(err);

      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Failed to save settings.',
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function uploadLogo(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    event.target.value = '';

    if (!file || !selectedBranchId) {
      return;
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.type)) {
      setError(
        'Invalid logo format. Please select JPG, JPEG, PNG or WEBP.',
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(
        'Logo image must be 5 MB or smaller.',
      );
      return;
    }

    setError('');
    setMessage('');

    const previewUrl =
      URL.createObjectURL(file);

    setLogoPreview(previewUrl);
    setUploadingLogo(true);

    try {
      const formData = new FormData();

      formData.append('logo', file);

      const token = getAuthToken();

      if (!token) {
        throw new Error(
          'Login required. Please log in again.',
        );
      }

      const response = await fetch(
        `${API_ROOT}/api/settings/${selectedBranchId}/logo`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            'Failed to upload logo.',
        );
      }

      setBranch((current) =>
        current
          ? {
              ...current,
              logoUrl:
                data.branch.logoUrl,
            }
          : current,
      );

      setMessage(
        'Restaurant logo uploaded successfully.',
      );
    } catch (err: any) {
      console.error(err);

      setLogoPreview(null);

      setError(
        err?.message ||
          'Failed to upload restaurant logo.',
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  async function deleteLogo() {
    if (!selectedBranchId || !branch?.logoUrl) {
      return;
    }

    const confirmed =
      window.confirm(
        'Delete the current restaurant logo?',
      );

    if (!confirmed) {
      return;
    }

    setDeletingLogo(true);
    setError('');
    setMessage('');

    try {
      const response =
        await api.delete(
          `/settings/${selectedBranchId}/logo`,
        );

      setBranch((current) =>
        current
          ? {
              ...current,
              logoUrl: null,
            }
          : current,
      );

      setLogoPreview(null);

      setMessage(
        response.data?.message ||
          'Restaurant logo deleted successfully.',
      );
    } catch (err: any) {
      console.error(err);

      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Failed to delete logo.',
      );
    } finally {
      setDeletingLogo(false);
    }
  }

  const logoUrl = branch?.logoUrl
    ? `${API_ROOT}${branch.logoUrl}`
    : null;

  if (loadingBranches) {
    return (
      <StaffLayout>
        <div className="settings-page">
          <div className="settings-loading">
            Loading settings...
          </div>
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout>
      <div className="settings-page">
        <div className="settings-header">
          <div>
            <h1>Settings</h1>
            <p>
              Manage restaurant information,
              billing, QR ordering and branding.
            </p>
          </div>

          {isSuperAdmin &&
            branches.length > 0 && (
              <div className="settings-branch-selector">
                <label>
                  Branch
                </label>

                <select
                  value={selectedBranchId}
                  onChange={(event) =>
                    setSelectedBranchId(
                      event.target.value,
                    )
                  }
                >
                  {branches.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
        </div>

        {isManager &&
          branch && (
            <div className="settings-branch-banner">
              <strong>
                {branch.name}
              </strong>

              <span>
                Branch settings
              </span>
            </div>
          )}

        {message && (
          <div className="settings-alert success">
            {message}
          </div>
        )}

        {error && (
          <div className="settings-alert error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="settings-loading">
            Loading settings...
          </div>
        ) : (
          <div className="settings-layout">
            <aside className="settings-sidebar">
              <button
                className={
                  activeSection ===
                  'restaurant'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveSection(
                    'restaurant',
                  )
                }
              >
                <span>🏪</span>
                Restaurant Information
              </button>

              <button
                className={
                  activeSection ===
                  'billing'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveSection(
                    'billing',
                  )
                }
              >
                <span>🧾</span>
                Billing & Receipt
              </button>

              <button
                className={
                  activeSection === 'qr'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveSection('qr')
                }
              >
                <span>📱</span>
                QR Ordering
              </button>

              <button
                className={
                  activeSection === 'logo'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveSection(
                    'logo',
                  )
                }
              >
                <span>🖼️</span>
                Restaurant Logo
              </button>
            </aside>

            <main className="settings-content">
              {activeSection ===
                'restaurant' && (
                <section className="settings-card">
                  <div className="card-heading">
                    <div>
                      <h2>
                        Restaurant
                        Information
                      </h2>
                      <p>
                        Update the basic
                        information shown
                        throughout the system.
                      </p>
                    </div>
                  </div>

                  <div className="settings-grid">
                    <label>
                      Restaurant Name
                      <input
                        value={
                          branchForm.name
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'name',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Phone
                      <input
                        value={
                          branchForm.phone
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'phone',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Email
                      <input
                        type="email"
                        value={
                          branchForm.email
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'email',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Country
                      <input
                        value={
                          branchForm.country
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'country',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      State
                      <input
                        value={
                          branchForm.state
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'state',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      City
                      <input
                        value={
                          branchForm.city
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'city',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label className="full">
                      Address
                      <textarea
                        value={
                          branchForm.address
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'address',
                            event.target
                              .value,
                          )
                        }
                        rows={3}
                      />
                    </label>

                    <label>
                      Opening Time
                      <input
                        type="time"
                        value={
                          branchForm.openingTime
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'openingTime',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Closing Time
                      <input
                        type="time"
                        value={
                          branchForm.closingTime
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'closingTime',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Weekly Holiday
                      <input
                        placeholder="e.g. Sunday"
                        value={
                          branchForm.weeklyHoliday
                        }
                        onChange={(event) =>
                          updateBranchField(
                            'weeklyHoliday',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>
                  </div>

                  <div className="card-actions">
                    <button
                      className="primary-button"
                      onClick={
                        saveBranchInformation
                      }
                      disabled={
                        savingBranch
                      }
                    >
                      {savingBranch
                        ? 'Saving...'
                        : 'Save Restaurant Information'}
                    </button>
                  </div>
                </section>
              )}

              {activeSection ===
                'billing' && (
                <section className="settings-card">
                  <div className="card-heading">
                    <div>
                      <h2>
                        Billing & Receipt
                      </h2>
                      <p>
                        Configure tax and
                        receipt settings.
                      </p>
                    </div>
                  </div>

                  <div className="settings-grid">
                    <label className="toggle-field">
                      <span>
                        Enable Tax
                      </span>

                      <input
                        type="checkbox"
                        checked={
                          settingsForm.taxEnabled
                        }
                        onChange={(event) =>
                          updateSettingsField(
                            'taxEnabled',
                            event.target
                              .checked,
                          )
                        }
                      />
                    </label>

                    <label>
                      Tax Rate (%)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={
                          settingsForm.taxRate
                        }
                        disabled={
                          !settingsForm.taxEnabled
                        }
                        onChange={(event) =>
                          updateSettingsField(
                            'taxRate',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Currency
                      <input
                        value={
                          settingsForm.currency
                        }
                        onChange={(event) =>
                          updateSettingsField(
                            'currency',
                            event.target
                              .value
                              .toUpperCase(),
                          )
                        }
                      />
                    </label>

                    <label>
                      Bill Prefix
                      <input
                        placeholder="e.g. SAM"
                        value={
                          settingsForm.billPrefix
                        }
                        onChange={(event) =>
                          updateSettingsField(
                            'billPrefix',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label className="full">
                      Receipt Footer
                      <textarea
                        rows={4}
                        placeholder="Thank you for visiting..."
                        value={
                          settingsForm.receiptFooter
                        }
                        onChange={(event) =>
                          updateSettingsField(
                            'receiptFooter',
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>
                  </div>

                  <div className="card-actions">
                    <button
                      className="primary-button"
                      onClick={saveSettings}
                      disabled={
                        savingSettings
                      }
                    >
                      {savingSettings
                        ? 'Saving...'
                        : 'Save Billing Settings'}
                    </button>
                  </div>
                </section>
              )}

              {activeSection === 'qr' && (
                <section className="settings-card">
                  <div className="card-heading">
                    <div>
                      <h2>
                        QR Ordering
                      </h2>
                      <p>
                        Control customer
                        ordering through
                        restaurant table QR
                        codes.
                      </p>
                    </div>
                  </div>

                  <div className="settings-option">
                    <div>
                      <strong>
                        Customer QR Ordering
                      </strong>

                      <p>
                        Allow customers to
                        scan a table QR code,
                        browse the menu and
                        place orders.
                      </p>
                    </div>

                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={
                          settingsForm.qrOrderingEnabled
                        }
                        onChange={(event) =>
                          updateSettingsField(
                            'qrOrderingEnabled',
                            event.target
                              .checked,
                          )
                        }
                      />
                      <span />
                    </label>
                  </div>

                  <div className="card-actions">
                    <button
                      className="primary-button"
                      onClick={saveSettings}
                      disabled={
                        savingSettings
                      }
                    >
                      {savingSettings
                        ? 'Saving...'
                        : 'Save QR Settings'}
                    </button>
                  </div>
                </section>
              )}

              {activeSection ===
                'logo' && (
                <section className="settings-card">
                  <div className="card-heading">
                    <div>
                      <h2>
                        Restaurant Logo
                      </h2>

                      <p>
                        Upload the logo used
                        throughout the
                        restaurant system.
                      </p>
                    </div>

                    {isSuperAdmin && (
                      <span className="permission-badge">
                        Super Admin
                      </span>
                    )}
                  </div>

                  <div className="logo-settings">
                    <div className="logo-preview">
                      {logoPreview ? (
                        <img
                          src={logoPreview}
                          alt="New restaurant logo preview"
                        />
                      ) : logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Restaurant logo"
                        />
                      ) : (
                        <div className="logo-placeholder">
                          <span>🏪</span>
                          <strong>
                            No Logo
                          </strong>
                          <small>
                            Upload a restaurant
                            logo
                          </small>
                        </div>
                      )}
                    </div>

                    <div className="logo-actions">
                      {isSuperAdmin ? (
                        <>
                          <label className="primary-button upload-button">
                            {uploadingLogo
                              ? 'Uploading...'
                              : branch?.logoUrl
                                ? 'Replace Logo'
                                : 'Upload Logo'}

                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                              onChange={
                                uploadLogo
                              }
                              disabled={
                                uploadingLogo
                              }
                            />
                          </label>

                          {branch?.logoUrl && (
                            <button
                              className="danger-button"
                              onClick={
                                deleteLogo
                              }
                              disabled={
                                deletingLogo
                              }
                            >
                              {deletingLogo
                                ? 'Deleting...'
                                : 'Delete Logo'}
                            </button>
                          )}

                          <p className="help-text">
                            JPG, JPEG, PNG or
                            WEBP. Maximum
                            size: 5 MB.
                          </p>
                        </>
                      ) : (
                        <div className="readonly-notice">
                          Only Super Admin can
                          change the restaurant
                          logo.
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </main>
          </div>
        )}
      </div>

      <style>{`
        .settings-page {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          margin-bottom: 20px;
        }

        .settings-header h1 {
          margin: 0;
          font-size: 28px;
        }

        .settings-header p {
          margin: 6px 0 0;
          color: #64748b;
        }

        .settings-branch-selector {
          min-width: 280px;
        }

        .settings-branch-selector label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
          color: #475569;
        }

        .settings-branch-selector select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: white;
        }

        .settings-branch-banner {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 18px;
          padding: 12px 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
        }

        .settings-branch-banner span {
          color: #64748b;
          font-size: 13px;
        }

        .settings-alert {
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 18px;
        }

        .settings-alert.success {
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
        }

        .settings-alert.error {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }

        .settings-loading {
          padding: 50px;
          text-align: center;
          color: #64748b;
        }

        .settings-layout {
          display: grid;
          grid-template-columns: 250px minmax(0, 1fr);
          gap: 20px;
          align-items: start;
        }

        .settings-sidebar {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 8px;
          position: sticky;
          top: 20px;
        }

        .settings-sidebar button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border: 0;
          background: transparent;
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
          color: #475569;
          font-weight: 500;
        }

        .settings-sidebar button:hover {
          background: #f8fafc;
        }

        .settings-sidebar button.active {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .settings-content {
          min-width: 0;
        }

        .settings-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
        }

        .card-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 24px;
        }

        .card-heading h2 {
          margin: 0;
          font-size: 20px;
        }

        .card-heading p {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 14px;
        }

        .permission-badge {
          padding: 5px 9px;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 600;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .settings-grid label {
          display: flex;
          flex-direction: column;
          gap: 7px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }

        .settings-grid label.full {
          grid-column: 1 / -1;
        }

        .settings-grid input,
        .settings-grid textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font: inherit;
          font-weight: 400;
          color: #0f172a;
          background: white;
        }

        .settings-grid textarea {
          resize: vertical;
        }

        .settings-grid input:focus,
        .settings-grid textarea:focus,
        .settings-branch-selector select:focus {
          outline: none;
          border-color: #60a5fa;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
        }

        .toggle-field {
          flex-direction: row !important;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }

        .card-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 24px;
          padding-top: 18px;
          border-top: 1px solid #e2e8f0;
        }

        .primary-button,
        .danger-button {
          border: 0;
          border-radius: 8px;
          padding: 10px 16px;
          cursor: pointer;
          font-weight: 600;
        }

        .primary-button {
          background: #2563eb;
          color: white;
        }

        .primary-button:disabled,
        .danger-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .danger-button {
          background: #fee2e2;
          color: #b91c1c;
        }

        .settings-option {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 18px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
        }

        .settings-option strong {
          display: block;
          margin-bottom: 5px;
        }

        .settings-option p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }

        .switch {
          position: relative;
          width: 48px;
          height: 26px;
          flex-shrink: 0;
        }

        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .switch span {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: #cbd5e1;
          cursor: pointer;
          transition: 0.2s;
        }

        .switch span::after {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          left: 3px;
          top: 3px;
          background: white;
          border-radius: 50%;
          transition: 0.2s;
        }

        .switch input:checked + span {
          background: #2563eb;
        }

        .switch input:checked + span::after {
          transform: translateX(22px);
        }

        .logo-settings {
          display: grid;
          grid-template-columns: 260px minmax(0, 1fr);
          gap: 30px;
          align-items: center;
        }

        .logo-preview {
          width: 260px;
          height: 200px;
          border: 2px dashed #cbd5e1;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: #f8fafc;
        }

        .logo-preview img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .logo-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          color: #64748b;
          text-align: center;
        }

        .logo-placeholder span {
          font-size: 42px;
        }

        .logo-placeholder small {
          color: #94a3b8;
        }

        .logo-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
        }

        .upload-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .upload-button input {
          display: none;
        }

        .help-text {
          margin: 0;
          color: #64748b;
          font-size: 12px;
        }

        .readonly-notice {
          padding: 12px 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          color: #64748b;
          font-size: 13px;
        }

        @media (max-width: 900px) {
          .settings-layout {
            grid-template-columns: 1fr;
          }

          .settings-sidebar {
            position: static;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
          }

          .logo-settings {
            grid-template-columns: 1fr;
          }

          .logo-preview {
            width: 100%;
            max-width: 360px;
          }
        }

        @media (max-width: 650px) {
          .settings-page {
            padding: 14px;
          }

          .settings-header {
            flex-direction: column;
            align-items: stretch;
          }

          .settings-branch-selector {
            min-width: 0;
          }

          .settings-sidebar {
            grid-template-columns: 1fr;
          }

          .settings-grid {
            grid-template-columns: 1fr;
          }

          .settings-grid label.full {
            grid-column: auto;
          }

          .settings-card {
            padding: 16px;
          }
        }
      `}</style>
    </StaffLayout>
  );
}