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
        {/* Mobile top bar — larger touch targets */}
        <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-gray-100 bg-white shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">PP</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">PagePilot</span>
        </div>

        {/* Email verification banner */}
        {user && !user.email_verified && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm shrink-0 bg-amber-50 border-b border-amber-200">
            <Mail size={14} className="text-amber-600 shrink-0" />
            <span className="text-amber-700 font-medium">Please verify your email.</span>
            <span className="text-amber-600 hidden sm:inline text-xs">Check your inbox for a verification link.</span>
            <button
              onClick={handleResend}
              disabled={resending}
              className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {resending ? 'Sending…' : 'Resend email'}
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
