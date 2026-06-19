import { NavLink, useNavigate } from 'react-router-dom';
import { Globe, LayoutDashboard, LogOut, Settings, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api/auth';
import toast from 'react-hot-toast';
import { useState } from 'react';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  onClick?: () => void;
}

function NavItem({ to, icon, label, end, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        )
      }
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </NavLink>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, clear } = useAuthStore();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await authApi.logout();
      clear();
      navigate('/login');
    } catch {
      toast.error('Logout failed');
    } finally {
      setLoggingOut(false);
    }
  };

  const sidebarContent = (
    <aside className="w-56 h-full flex flex-col bg-white border-r border-gray-100 shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold tracking-tight">RC</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">ReactCMS</span>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1 text-gray-400 hover:text-gray-600 rounded-md transition-colors"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <NavItem to="/dashboard" icon={<LayoutDashboard size={16} />} label="Dashboard" end onClick={onClose} />
        <NavItem to="/websites" icon={<Globe size={16} />} label="Websites" onClick={onClose} />
        <NavItem to="/settings" icon={<Settings size={16} />} label="Settings" onClick={onClose} />
      </nav>

      {/* User */}
      <div className="p-2 border-t border-gray-100">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-semibold shrink-0">
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors mt-0.5"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:flex h-screen">
        {sidebarContent}
      </div>

      {/* Mobile overlay sidebar */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="relative z-10 h-screen animate-slide-in">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
