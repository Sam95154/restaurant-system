import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

// Current token kept in memory for immediate requests.
let currentToken: string | null =
  localStorage.getItem('auth_token');

// Update authentication token.
export function setAuthToken(token: string | null) {
  currentToken = token;

  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

// Attach the latest authentication token to every request.
api.interceptors.request.use((config) => {
  const token =
    currentToken ||
    localStorage.getItem('auth_token');

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Handle API errors consistently.
// The rejected value is still an Error whose `message` is the friendly text
// (same as before). The only change: it now also carries `status` and
// `response`, so callers can tell a 404 ("bill not created yet") apart from a
// real failure. Code that only reads `err.message` behaves exactly as before.
api.interceptors.response.use(
  (response) => response,

  (error) => {
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      'Something went wrong. Please try again.';

    const wrapped = new Error(message) as Error & {
      status?: number;
      response?: unknown;
    };

    wrapped.status = error?.response?.status;
    wrapped.response = error?.response;

    return Promise.reject(wrapped);
  }
);