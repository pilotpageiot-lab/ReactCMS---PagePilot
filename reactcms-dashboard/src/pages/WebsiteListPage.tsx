import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { websitesApi } from '@/api/websites';
import { ApiError } from '@/lib/api-client';
import { clsx } from 'clsx';

const PLAN_VARIANT: Record<string, 'default' | 'indigo' | 'success'> = {
  free: 'default',
  pro: 'indigo',
  enterprise: 'success',
};

function PlanSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const plans = ['free', 'pro', 'enterprise'];
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">Plan</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        {plans.map((p) => (
          <option key={p} value={p}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function WebsiteListPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['websites'],
    queryFn: () => websitesApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; slug: string; plan: string }) =>
      websitesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['websites'] });
      setCreateOpen(false);
      toast.success('Website created');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create website');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => websitesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['websites'] });
      setDeletingId(null);
      toast.success('Website deleted');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete');
    },
  });

  const websites = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Websites"
        description={`${websites.length} website${websites.length !== 1 ? 's' : ''} in your account`}
        action={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
          >
            New website
          </Button>
        }
      />

      <div className="px-6 pb-6">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 h-16 animate-pulse" />
            ))}
          </div>
        ) : websites.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200">
            <EmptyState
              icon={<Globe size={20} />}
              title="No websites yet"
              description="Create your first website to start managing content."
              action={{ label: 'Create website', onClick: () => setCreateOpen(true) }}
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Website
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Plan
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                    Content
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    Role
                  </th>
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {websites.map((site) => (
                  <tr key={site.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className={clsx(
                            'w-1 h-8 rounded-full shrink-0',
                            site.is_active ? 'bg-emerald-400' : 'bg-gray-200',
                          )}
                          title={site.is_active ? 'Active' : 'Inactive'}
                        />
                        <div>
                          <Link
                            to={`/websites/${site.id}`}
                            className="font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                          >
                            {site.name}
                          </Link>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">
                            {site.slug}.reactcms.io
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={PLAN_VARIANT[site.plan] ?? 'default'}>{site.plan}</Badge>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell text-gray-600">
                      {site.content_count ?? 0} items
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell text-gray-500 capitalize">
                      {site.role}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Link
                          to={`/websites/${site.id}`}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                          title="Manage"
                        >
                          <ExternalLink size={14} />
                        </Link>
                        {site.role === 'owner' && (
                          <button
                            onClick={() => setDeletingId(site.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      <CreateWebsiteModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(payload) => createMutation.mutate(payload)}
        loading={createMutation.isPending}
      />

      {/* Delete confirm */}
      <Modal
        open={deletingId !== null}
        onClose={() => setDeletingId(null)}
        title="Delete website"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-5">
          This will permanently delete the website and all its content. This action cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeletingId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleteMutation.isPending}
            onClick={() => deletingId && deleteMutation.mutate(deletingId)}
          >
            Delete website
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Create website modal ──────────────────────────────────────────────────────

function CreateWebsiteModal({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; slug: string; plan: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState('free');

  const handleNameChange = (v: string) => {
    setName(v);
    setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ name, slug, plan });
  };

  return (
    <Modal open={open} onClose={onClose} title="New website">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Website name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="My Awesome Site"
          required
          autoFocus
        />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="my-awesome-site"
          hint="Used for your reactcms.io subdomain"
          pattern="[a-z0-9-]+"
          required
          prefix="/"
        />
        <PlanSelect value={plan} onChange={setPlan} />
        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            Create website
          </Button>
        </div>
      </form>
    </Modal>
  );
}
