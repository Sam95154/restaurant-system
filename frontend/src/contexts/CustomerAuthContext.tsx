import React, { createContext, useCallback, useContext, useState } from 'react';
import { api, setAuthToken } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import type { Customer } from '../types';

interface CustomerAuthState {
  customer: Customer | null;
  token: string | null;
  sendOtp: (identifier: string) => Promise<{ customerId: string; devCode?: string }>;
  verifyOtp: (customerId: string, code: string) => Promise<void>;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const sendOtp = useCallback(async (identifier: string) => {
    const res = await api.post('/auth/customer/send-otp', { identifier });
    return res.data as { customerId: string; devCode?: string };
  }, []);

  const verifyOtp = useCallback(async (customerId: string, code: string) => {
    const res = await api.post('/auth/customer/verify-otp', { customerId, code });
    setToken(res.data.token);
    setCustomer(res.data.customer);
    setAuthToken(res.data.token);
    connectSocket(res.data.token);
  }, []);

  const logout = useCallback(() => {
    setCustomer(null);
    setToken(null);
    setAuthToken(null);
    disconnectSocket();
  }, []);

  return (
    <CustomerAuthContext.Provider value={{ customer, token, sendOtp, verifyOtp, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider');
  return ctx;
}
