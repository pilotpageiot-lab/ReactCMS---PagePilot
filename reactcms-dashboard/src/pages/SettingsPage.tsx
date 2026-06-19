import { useState, FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api/auth';
import toast from 'react-hot-toast';

export function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

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

  return (
    <div>
      <PageHeader title="Account settings" description="Manage your profile and preferences." />
      <div className="px-6 pb-6 max-w-xl space-y-6">
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
      </div>
    </div>
  );
}
