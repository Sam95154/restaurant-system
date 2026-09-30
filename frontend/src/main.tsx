import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { CustomerAuthProvider } from './contexts/CustomerAuthContext';
import { RestaurantBrandingProvider } from './contexts/RestaurantBrandingContext';
import './index.css';


const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
  <CustomerAuthProvider>
    <RestaurantBrandingProvider>
      <App />
    </RestaurantBrandingProvider>
  </CustomerAuthProvider>
</AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
