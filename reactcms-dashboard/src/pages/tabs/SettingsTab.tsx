import { useState, FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { websitesApi } from '@/api/websites';
import { ApiError } from '@/lib/api-client';
import type { Website } from '@/types';

const PLANS = [
  { id: 'free', label: 'Free', price: '$0/mo', desc: '1 website · 7-day history' },
  { id: 'pro', label: 'Pro', price: '$9/mo', desc: '3 websites · 90-day history' },
  { id: 'enterprise', label: 'Enterprise', price: '$49/mo', desc: 'Unlimited · 1-year history' },
];

export function SettingsTab({ website }: { website: Website }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(website.name);
  const [domain, setDomain] = useState(website.custom_domain ?? '');
  const [webhookUrl, setWebhookUrl] = useState(website.webhook_url ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [upgradingTo, setUpgradingTo] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      websitesApi.update(website.id, {
        name,
        custom_domain: domain || null,
        webhook_url: webhookUrl || null,
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['website', website.id] });
      toast.success('Settings saved');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => websitesApi.delete(website.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['websites'] });
      toast.success('Website deleted');
      navigate('/websites');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Delete failed'),
  });

  const upgradeMutation = useMutation({
    mutationFn: (plan: string) => websitesApi.update(website.id, { plan } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['website', website.id] });
      queryClient.invalidateQueries({ queryKey: ['plan-usage'] });
      setUpgradingTo(null);
      toast.success('Plan updated');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Upgrade failed'),
  });

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="p-4 sm:p-6 max-w-xl space-y-6 sm:space-y-8">
      {/* General settings */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-4">General</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Website name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Custom domain"
            type="url"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="https://cms.yourdomain.com"
            hint="Optional — leave blank to use your reactcms.io subdomain"
          />
          <Input
            label="Webhook URL"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            hint="Receives a POST request when content is published"
          />
          <div className="pt-1">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={updateMutation.isPending}
            >
              Save changes
            </Button>
          </div>
        </form>
      </section>

      {/* Read-only info */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Website info</h2>
        <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100">
          {[
            { label: 'Slug', value: website.slug },
            { label: 'Plan', value: website.plan },
            { label: 'Website ID', value: website.id },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3">
              <span className="text-xs sm:text-sm text-gray-500">{label}</span>
              <span className="text-xs sm:text-sm font-mono text-gray-900 break-all">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Plan */}
      {website.role === 'owner' && (
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PLANS.map((p) => {
              const isCurrent = website.plan === p.id;
              return (
                <div
                  key={p.id}
                  className={clsx(
                    'rounded-xl border p-4 transition-colors',
                    isCurrent ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white',
                  )}
                >
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{p.label}</div>
                  <div className="text-lg font-bold text-gray-900 mb-0.5">{p.price}</div>
                  <p className="text-xs text-gray-500 mb-3">{p.desc}</p>
                  {isCurrent ? (
                    <span className="text-xs font-semibold text-indigo-600">Current plan</span>
                  ) : (
                    <Button
                      size="sm"
                      variant={p.id === 'pro' ? 'primary' : 'secondary'}
                      loading={upgradingTo === p.id && upgradeMutation.isPending}
                      onClick={() => { setUpgradingTo(p.id); upgradeMutation.mutate(p.id); }}
                    >
                      {PLANS.findIndex((x) => x.id === p.id) > PLANS.findIndex((x) => x.id === website.plan) ? 'Upgrade' : 'Downgrade'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Danger zone */}
      {website.role === 'owner' && (
        <section>
          <h2 className="text-sm font-semibold text-red-600 mb-4">Danger zone</h2>
          <div className="border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Delete this website</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Permanently removes all content, API keys, and members.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="shrink-0 self-start sm:self-auto"
            >
              Delete website
            </Button>
          </div>
        </section>
      )}

      {/* Delete confirm modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete website" size="sm">
        <p className="text-sm text-gray-600 mb-3">
          This will permanently delete <strong>{website.name}</strong> and all its content.
          Type the website slug to confirm:
        </p>
        <Input
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder={website.slug}
          className="mb-4 font-mono"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            disabled={deleteConfirm !== website.slug}
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Delete permanently
          </Button>
        </div>
      </Modal>
    </div>
  );
}
