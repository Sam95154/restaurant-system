import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../../contexts/CustomerAuthContext';

export default function CustomerLogin() {
  const { sendOtp, verifyOtp } = useCustomerAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function onSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await sendOtp(identifier);
      setCustomerId(res.customerId);
      setDevCode(res.devCode ?? null);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await verifyOtp(customerId!, code);
      navigate('/order');
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-coffee-dark px-4">
      <div className="bg-white rounded p-8 w-full max-w-sm space-y-4">
        <h1 className="font-serif text-2xl">Sam's Cafe</h1>
        {error && <div className="text-chili text-sm">{error}</div>}
        {!customerId ? (
          <form onSubmit={onSendOtp} className="space-y-3">
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="Phone or email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <button className="w-full bg-turmeric text-coffee-dark font-semibold rounded py-2">Send OTP</button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="space-y-3">
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="4-digit code"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {devCode && (
              <p className="text-xs text-gray-500">
                Demo mode: your code is <strong>{devCode}</strong> (only shown because OTP_PROVIDER=MOCK).
              </p>
            )}
            <button className="w-full bg-turmeric text-coffee-dark font-semibold rounded py-2">Verify & continue</button>
          </form>
        )}
      </div>
    </div>
  );
}
