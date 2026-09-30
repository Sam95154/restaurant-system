import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, API_BASE_URL } from '../api/client';
export default function EmployeeLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState('');
const [password, setPassword] = useState('');
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);
const [brandName, setBrandName] = useState("Sam's Cafe");
const [logoUrl, setLogoUrl] = useState<string | null>(null);
useEffect(() => {
  api
    .get('/branches/public')
    .then((res) => {
      const branches = res.data?.branches ?? [];

      if (branches.length === 0) {
        return;
      }

      const branch = branches[0];

      setBrandName("SAM'S RMS");
      
      setLogoUrl(
        branch.logoUrl
          ? `${API_BASE_URL.replace(/\/api\/?$/, '')}${branch.logoUrl}`
          : null
      );
    })
    .catch(() => {
      // Keep the existing fallback branding if public branding cannot be loaded.
    });
}, []);
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError('');
    setLoading(true);

    try {
      await login(loginId, password);
      navigate('/staff');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-coffee-dark px-4">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-xl p-8 w-full max-w-sm space-y-5 shadow-2xl"
      >
        {/* Brand */}
<div className="text-center">
  {logoUrl ? (
    <img
      src={logoUrl}
      alt={`${brandName} logo`}
      className="mx-auto mb-4 h-14 w-14 object-contain"
    />
  ) : (
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-turmeric font-serif text-2xl font-bold text-coffee-dark">
      S
    </div>
  )}

  <h1 className="font-serif text-2xl font-bold text-coffee-dark">
    {brandName}
  </h1>

  

  <p className="mt-1 text-sm text-gray-500">
    Restaurant Management System
  </p>
</div>

        {/* Login title */}
        <div>
          <h2 className="text-lg font-semibold text-coffee-dark">
            Staff Login
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Sign in to access your restaurant workspace.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-chili">
            {error}
          </div>
        )}

        {/* Login ID */}
        <div>
          <label
            htmlFor="loginId"
            className="mb-1.5 block text-sm font-medium text-coffee-dark"
          >
            Login ID
          </label>

          <input
            id="loginId"
            type="text"
            autoComplete="username"
            required
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="Enter your login ID"
            className="w-full rounded-lg border border-coffee/15 px-3 py-2.5 text-sm outline-none transition focus:border-turmeric focus:ring-2 focus:ring-turmeric/20"
          />
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-coffee-dark"
          >
            Password
          </label>

          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full rounded-lg border border-coffee/15 px-3 py-2.5 text-sm outline-none transition focus:border-turmeric focus:ring-2 focus:ring-turmeric/20"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-turmeric py-2.5 font-semibold text-coffee-dark transition hover:bg-turmeric-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          Authorized staff access only
        </p>
      </form>
    </div>
  );
}