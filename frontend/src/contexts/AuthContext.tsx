import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { api, setAuthToken } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import type { Employee } from '../types';

interface AuthState {
  employee: Employee | null;
  token: string | null;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = 'auth_token';
const EMPLOYEE_KEY = 'employee';

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [employee, setEmployee] = useState<Employee | null>(() => {
    try {
      const storedEmployee = localStorage.getItem(EMPLOYEE_KEY);

      if (!storedEmployee) {
        return null;
      }

      return JSON.parse(storedEmployee) as Employee;
    } catch {
      localStorage.removeItem(EMPLOYEE_KEY);
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });

  // Restore authentication when the application starts.
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);

    if (storedToken) {
      setAuthToken(storedToken);
      connectSocket(storedToken);
    }
  }, []);

  const login = useCallback(
    async (loginId: string, password: string) => {
      const res = await api.post('/auth/login', {
        loginId,
        password,
      });

      const newToken = res.data.token;
      const newEmployee = res.data.employee;

      // React state
      setToken(newToken);
      setEmployee(newEmployee);

      // Persistent storage
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(
        EMPLOYEE_KEY,
        JSON.stringify(newEmployee)
      );

      // API authentication
      setAuthToken(newToken);

      // Realtime connection
      connectSocket(newToken);
    },
    []
  );

  const logout = useCallback(() => {
    // React state
    setEmployee(null);
    setToken(null);

    // Persistent storage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMPLOYEE_KEY);

    // API authentication
    setAuthToken(null);

    // Realtime connection
    disconnectSocket();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        employee,
        token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error(
      'useAuth must be used inside AuthProvider'
    );
  }

  return ctx;
}