import { useState, FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api/auth';
import { ApiError } from '@/lib/api-client';
import { clsx } from 'clsx';

type Tab = 'login' | 'register' | 'reset';

export function LoginPage() {
  const { isAuthenticated, setUser } = useAuthStore();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const switchTab = (t: Tab) => { setTab(t); setError(''); setSuccess(''); };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (tab === 'reset') {
        await authApi.forgotPassword(email);
        setSuccess('If that email is registered, a reset link has been sent. Check your inbox.');
      } else if (tab === 'login') {
        const result = await authApi.login(email, password);
        setUser(result.user);
        navigate('/dashboard', { replace: true });
      } else {
        const result = await authApi.register(name, email, password);
        setUser(result.user);
        if (!result.user.email_verified) {
          setSuccess('Account created! Check your email for a verification link.');
          setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
        } else {
          navigate('/dashboard', { replace: true });
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <span className="text-white text-sm font-bold">PP</span>
          </div>
          <span className="text-xl font-semibold text-gray-900">PagePilot</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {([
              { id: 'login' as Tab, label: 'Sign in' },
              { id: 'register' as Tab, label: 'Create account' },
              { id: 'reset' as Tab, label: 'Forgot password' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className={clsx(
                  'flex-1 py-3 text-xs sm:text-sm font-medium transition-colors',
                  tab === id
                    ? 'text-gray-900 border-b-2 border-indigo-600 -mb-px'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
            {tab === 'register' && (
              <Input
                label="Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                autoFocus={tab === 'register'}
              />
            )}

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus={tab === 'login' || tab === 'reset'}
              autoComplete={tab === 'login' ? 'username' : 'email'}
            />

            {tab !== 'reset' && (
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'register' ? 'At least 8 characters' : '••••••••'}
                required
                minLength={tab === 'register' ? 8 : undefined}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-700">
                <CheckCircle size={15} className="shrink-0 mt-0.5" />
                {success}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-1"
            >
              {tab === 'login' ? 'Sign in' : tab === 'register' ? 'Create account' : 'Send reset link'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
