import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';

import './styles.css';

// Lazy-loaded routes — only downloaded when navigated to
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const WebsiteListPage = lazy(() => import('@/pages/WebsiteListPage').then(m => ({ default: m.WebsiteListPage })));
const WebsiteDetailPage = lazy(() => import('@/pages/WebsiteDetailPage').then(m => ({ default: m.WebsiteDetailPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const PagePilotPage = lazy(() => import('@/pages/PagePilotPage').then(m => ({ default: m.PagePilotPage })));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--color-bg, #0b1220)' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-green, #22c55e)' }} />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 120_000, // 2 minutes — reduces unnecessary re-fetches
      retry: (failureCount, error) => {
        if ((error as { status?: number }).status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/websites/:id/pagepilot" element={<PagePilotPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/websites" element={<WebsiteListPage />} />
              <Route path="/websites/:id" element={<WebsiteDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            borderRadius: '10px',
            fontSize: '14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
