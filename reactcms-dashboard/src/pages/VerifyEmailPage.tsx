import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { setUser } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }

    authApi.verifyEmail(token)
      .then((res) => {
        setStatus('success');
        setMessage('Your email has been verified!');
        setUser(res.user);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err?.message ?? 'Verification failed. The link may have expired.');
      });
  }, [token, setUser]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <span className="text-white text-sm font-bold">PP</span>
          </div>
          <span className="text-xl font-semibold text-gray-900">PagePilot</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
              <p className="text-sm text-gray-600">Verifying your email…</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={24} className="text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">{message}</p>
              <Link
                to="/dashboard"
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500 transition-colors"
              >
                Go to dashboard
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle size={24} className="text-red-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">{message}</p>
              <Link
                to="/login"
                className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Back to login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
