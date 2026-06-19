import { useState, FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api/auth';
import { ApiError } from '@/lib/api-client';
import { clsx } from 'clsx';

type Tab = 'login' | 'register';

export function LoginPage() {
  const { isAuthenticated, setUser } = useAuthStore();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result =
        tab === 'login'
          ? await authApi.login(email, password)
          : await authApi.register(name, email, password);

      setUser(result.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
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
            <span className="text-white text-sm font-bold">RC</span>
          </div>
          <span className="text-xl font-semibold text-gray-900">ReactCMS</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {(['login', 'register'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className={clsx(
                  'flex-1 py-3 text-sm font-medium transition-colors',
                  tab === t
                    ? 'text-gray-900 border-b-2 border-indigo-600 -mb-px'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {t === 'login' ? 'Sign in' : 'Create account'}
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
              autoFocus={tab === 'login'}
              autoComplete={tab === 'login' ? 'username' : 'email'}
            />

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

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-1"
            >
              {tab === 'login' ? 'Sign in' : 'Create account'}
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
