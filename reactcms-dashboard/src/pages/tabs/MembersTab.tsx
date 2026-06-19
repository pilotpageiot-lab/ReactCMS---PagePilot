import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { websitesApi } from '@/api/websites';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/date';
import { clsx } from 'clsx';

const ROLE_BADGE: Record<string, 'indigo' | 'default' | 'success'> = {
  owner: 'indigo',
  admin: 'success',
  editor: 'default',
  viewer: 'default',
};

export function MembersTab({ websiteId }: { websiteId: string }) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['members', websiteId],
    queryFn: () => websitesApi.listMembers(websiteId),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => websitesApi.removeMember(websiteId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', websiteId] });
      setRemovingId(null);
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
  });

  const members = data?.data ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Team members</h2>
          <p className="text-xs text-gray-500 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setInviteOpen(true)}>
          Invite
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState
            icon={<Users size={18} />}
            title="No members yet"
            description="Invite team members to collaborate on this website."
            action={{ label: 'Invite member', onClick: () => setInviteOpen(true) }}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-start sm:items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5 group">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-semibold shrink-0">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{m.name}</p>
                <p className="text-xs text-gray-500 truncate">{m.email}</p>
                <div className="flex items-center gap-2 mt-1 sm:hidden">
                  <Badge variant={ROLE_BADGE[m.role] ?? 'default'}>{m.role}</Badge>
                  {m.accepted_at ? (
                    <span className="text-xs text-gray-400">Joined {formatDate(m.accepted_at)}</span>
                  ) : (
                    <span className="text-xs text-amber-500">Pending</span>
                  )}
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-3 shrink-0">
                <Badge variant={ROLE_BADGE[m.role] ?? 'default'}>{m.role}</Badge>
                {m.accepted_at ? (
                  <span className="text-xs text-gray-400">Joined {formatDate(m.accepted_at)}</span>
                ) : (
                  <span className="text-xs text-amber-500">Pending invite</span>
                )}
              </div>
              {m.role !== 'owner' && (
                <button
                  onClick={() => setRemovingId(m.user_id)}
                  className="sm:opacity-0 sm:group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded transition-all shrink-0"
                  title="Remove"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        websiteId={websiteId}
        onInvited={() => {
          queryClient.invalidateQueries({ queryKey: ['members', websiteId] });
          setInviteOpen(false);
        }}
      />

      <Modal open={removingId !== null} onClose={() => setRemovingId(null)} title="Remove member" size="sm">
        <p className="text-sm text-gray-600 mb-5">This member will lose access to the website immediately.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setRemovingId(null)}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            loading={removeMutation.isPending}
            onClick={() => removingId && removeMutation.mutate(removingId)}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function InviteModal({
  open, onClose, websiteId, onInvited,
}: {
  open: boolean; onClose: () => void; websiteId: string; onInvited: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await websitesApi.inviteMember(websiteId, { email, role });
      toast.success(`Invite sent to ${email}`);
      setEmail('');
      onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite member">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" required autoFocus />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Role</label>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {['admin', 'editor', 'viewer'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={clsx(
                  'py-2 text-sm rounded-lg border font-medium transition-colors capitalize',
                  role === r ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>Send invite</Button>
        </div>
      </form>
    </Modal>
  );
}
