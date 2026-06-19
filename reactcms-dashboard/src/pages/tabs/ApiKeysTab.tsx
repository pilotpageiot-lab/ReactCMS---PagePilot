import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { apiKeysApi } from '@/api/apikeys';
import { ApiError } from '@/lib/api-client';
import { formatRelative, formatDate } from '@/lib/date';
import type { ApiKey } from '@/types';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handle}
      className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded"
      title="Copy"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
}

export function ApiKeysTab({ websiteId }: { websiteId: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['apikeys', websiteId],
    queryFn: () => apiKeysApi.list(websiteId),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(websiteId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apikeys', websiteId] });
      setRevokingId(null);
      toast.success('Key revoked');
    },
    onError: () => toast.error('Revoke failed'),
  });

  const keys = data?.data ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">API keys</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Use read-scoped keys in your SDK embed. Keep write-scoped keys server-side.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setCreateOpen(true)}
        >
          New key
        </Button>
      </div>

      {/* Newly created key banner */}
      {newKey && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800 mb-1">
                Copy your new API key — it won't be shown again.
              </p>
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-emerald-200">
                <code className="text-xs font-mono text-gray-800 flex-1 break-all">{newKey}</code>
                <CopyButton text={newKey} />
              </div>
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="text-emerald-600 hover:text-emerald-800 text-xs font-medium shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState
            icon={<Key size={18} />}
            title="No API keys"
            description="Create a read-scoped key to embed in your website's SDK."
            action={{ label: 'Create key', onClick: () => setCreateOpen(true) }}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[480px] sm:min-w-0">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-3 sm:px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Label</th>
                <th className="text-left px-3 sm:px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prefix</th>
                <th className="text-left px-3 sm:px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope</th>
                <th className="text-left px-3 sm:px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Last used</th>
                <th className="px-3 sm:px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-3 sm:px-4 py-3 font-medium text-gray-900">{k.label}</td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 sm:px-2 py-0.5 rounded">
                        {k.key_prefix}…
                      </code>
                      <CopyButton text={k.key_prefix} />
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <Badge variant={k.scope === 'write' ? 'warning' : 'default'}>{k.scope}</Badge>
                  </td>
                  <td className="px-3 sm:px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                    {k.last_used_at ? formatRelative(k.last_used_at) : 'Never'}
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <button
                      onClick={() => setRevokingId(k.id)}
                      className="sm:opacity-0 sm:group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded transition-all"
                      title="Revoke"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <CreateKeyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        websiteId={websiteId}
        onCreated={(key) => {
          queryClient.invalidateQueries({ queryKey: ['apikeys', websiteId] });
          setNewKey(key);
          setCreateOpen(false);
        }}
      />

      {/* Revoke confirm */}
      <Modal open={revokingId !== null} onClose={() => setRevokingId(null)} title="Revoke API key" size="sm">
        <p className="text-sm text-gray-600 mb-5">
          Any website using this key will lose access immediately.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setRevokingId(null)}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            loading={revokeMutation.isPending}
            onClick={() => revokingId && revokeMutation.mutate(revokingId)}
          >
            Revoke key
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function CreateKeyModal({
  open,
  onClose,
  websiteId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  websiteId: string;
  onCreated: (key: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiKeysApi.create(websiteId, { label, scope });
      onCreated(result.key);
      setLabel('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New API key">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Production read key"
          required
          autoFocus
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Scope</label>
          <div className="grid grid-cols-2 gap-2">
            {(['read', 'write'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={clsx(
                  'py-2.5 text-sm rounded-lg border font-medium transition-colors text-center',
                  scope === s
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300',
                )}
              >
                <span className="block font-mono text-xs mb-0.5">cms_{s === 'read' ? 'pk' : 'sk'}_…</span>
                {s === 'read' ? 'Read only' : 'Read + write'}
              </button>
            ))}
          </div>
          {scope === 'write' && (
            <p className="text-xs text-amber-600">Write-scoped keys should only be used server-side.</p>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>Create key</Button>
        </div>
      </form>
    </Modal>
  );
}
