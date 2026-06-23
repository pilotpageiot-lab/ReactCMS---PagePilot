import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Menu, Mail, Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api/auth';
import toast from 'react-hot-toast';

export function AppLayout() {
  const { isAuthenticated, user } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resending, setResending] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleResend = async () => {
    setResending(true);
    try {
      await authApi.resendVerification();
      toast.success('Verification email sent — check your inbox');
    } catch {
      toast.error('Failed to send verification email');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-2.5 px-4 h-12 border-b border-gray-100 bg-white shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">PP</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">PagePilot</span>
        </div>

        {/* Email verification banner */}
        {user && !user.email_verified && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 text-xs shrink-0"
            style={{ background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)' }}
          >
            <Mail size={13} style={{ color: '#f59e0b' }} />
            <span style={{ color: '#f59e0b' }} className="font-medium">
              Please verify your email address.
            </span>
            <span style={{ color: '#92400e' }} className="hidden sm:inline">
              Check your inbox for a verification link.
            </span>
            <button
              onClick={handleResend}
              disabled={resending}
              className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
              style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)' }}
            >
              {resending ? <Loader2 size={12} className="animate-spin" /> : 'Resend email'}
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
