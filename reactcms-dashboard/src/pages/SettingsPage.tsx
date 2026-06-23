import { useState, FormEvent } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api/auth';
import { ApiError } from '@/lib/api-client';
import toast from 'react-hot-toast';

export function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await authApi.me();
      setUser({ ...updated, name });
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match');
      return;
    }
    setPwLoading(true);
    try {
      await authApi.updatePassword(oldPw, newPw);
      toast.success('Password updated');
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Account settings" description="Manage your profile and preferences." />
      <div className="px-4 sm:px-6 pb-6 max-w-xl space-y-6">
        {/* Profile */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Profile</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input label="Email" value={user?.email ?? ''} disabled hint="Email cannot be changed." />
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" variant="primary" size="sm" loading={saving}>
                Save profile
              </Button>
              <Badge variant={user?.role === 'superadmin' ? 'indigo' : 'default'}>
                {user?.role}
              </Badge>
            </div>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Change password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Input
              label="Current password"
              type="password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repeat new password"
              required
              minLength={8}
            />
            {pwError && (
              <p className="text-xs text-red-500">{pwError}</p>
            )}
            <Button type="submit" variant="primary" size="sm" loading={pwLoading}>
              Update password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
