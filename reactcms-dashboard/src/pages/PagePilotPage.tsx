import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save, Rocket, List, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { websitesApi } from '@/api/websites';
import { contentApi } from '@/api/content';

const API_URL = import.meta.env['VITE_API_URL'] ?? '';

function getAccessToken(): string | null {
  return localStorage.getItem('rcms_access_token');
}

interface PendingChange {
  key: string;
  value: string;
  content_type: string;
  original: string;
  status: 'pending' | 'saving' | 'saved' | 'published' | 'error';
}

export function PagePilotPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuthStore();

  const [changes, setChanges] = useState<Map<string, PendingChange>>(new Map());
  const [iframeReady, setIframeReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [elementCount, setElementCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { data: website } = useQuery({
    queryKey: ['website', id],
    queryFn: () => websitesApi.get(id!),
    enabled: !!id,
  });

  // PostMessage bridge
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data.type !== 'string') return;

      switch (data.type) {
        case 'pagepilot:ready':
          setIframeReady(true);
          iframeRef.current?.contentWindow?.postMessage({ type: 'pagepilot:init' }, '*');
          break;

        case 'pagepilot:elements':
          setElementCount(data.count ?? 0);
          break;

        case 'pagepilot:change':
          setChanges((prev) => {
            const next = new Map(prev);
            next.set(data.key, {
              key: data.key,
              value: data.value,
              content_type: data.content_type,
              original: data.original,
              status: 'pending',
            });
            return next;
          });
          if (!panelOpen) setPanelOpen(true);
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [panelOpen]);

  const pendingCount = Array.from(changes.values()).filter((c) => c.status === 'pending').length;
  const savedCount = Array.from(changes.values()).filter((c) => c.status === 'saved').length;

  const saveAll = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    const pending = Array.from(changes.values()).filter((c) => c.status === 'pending');

    for (const change of pending) {
      setChanges((prev) => {
        const next = new Map(prev);
        next.set(change.key, { ...change, status: 'saving' });
        return next;
      });
      try {
        await contentApi.upsert(id, change.key, {
          content_type: change.content_type,
          value: change.value,
        });
        setChanges((prev) => {
          const next = new Map(prev);
          next.set(change.key, { ...change, status: 'saved' });
          return next;
        });
      } catch {
        setChanges((prev) => {
          const next = new Map(prev);
          next.set(change.key, { ...change, status: 'error' });
          return next;
        });
        toast.error(`Failed to save ${change.key}`);
      }
    }

    setSaving(false);
    if (pending.length > 0) toast.success(`Saved ${pending.length} draft(s)`);
  }, [id, changes]);

  const publishAll = useCallback(async () => {
    if (!id) return;
    setPublishing(true);
    const saved = Array.from(changes.values()).filter((c) => c.status === 'saved');

    let count = 0;
    for (const change of saved) {
      try {
        await contentApi.publish(id, change.key);
        setChanges((prev) => {
          const next = new Map(prev);
          next.set(change.key, { ...change, status: 'published' });
          return next;
        });
        count++;
      } catch {
        toast.error(`Failed to publish ${change.key}`);
      }
    }

    setPublishing(false);
    if (count > 0) toast.success(`Published ${count} key(s)`);
  }, [id, changes]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!id) return <Navigate to="/websites" replace />;

  const token = getAccessToken();
  const previewUrl = token
    ? `${API_URL}/sdk/v1/preview/${id}?token=${encodeURIComponent(token)}`
    : null;

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--color-bg, #0b1220)' }}>
      {/* Toolbar */}
      <div
        className="h-12 flex items-center gap-3 px-4 shrink-0"
        style={{ background: 'var(--color-card, #111c2e)', borderBottom: '1px solid var(--color-border, #1e293b)' }}
      >
        <Link
          to={`/websites/${id}`}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--color-muted, #94a3b8)' }}
          title="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </Link>

        <div className="w-px h-5" style={{ background: 'var(--color-border, #1e293b)' }} />

        <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text, #e2e8f0)' }}>
          {website?.name ?? 'Loading...'}
        </span>
        <span className="text-xs hidden sm:inline" style={{ color: 'var(--color-subtle, #64748b)' }}>
          PagePilot
        </span>

        {iframeReady && elementCount > 0 && (
          <span className="text-xs hidden sm:inline" style={{ color: 'var(--color-subtle, #64748b)' }}>
            {elementCount} editable
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {changes.size > 0 && (
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors"
              style={{
                color: pendingCount > 0 ? '#f59e0b' : 'var(--color-green, #22c55e)',
                background: pendingCount > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
              }}
            >
              <List size={12} />
              {changes.size} change{changes.size !== 1 ? 's' : ''}
            </button>
          )}

          <button
            onClick={saveAll}
            disabled={saving || pendingCount === 0}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border, #1e293b)',
              color: 'var(--color-text, #e2e8f0)',
            }}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>

          <button
            onClick={publishAll}
            disabled={publishing || savedCount === 0}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
            style={{
              background: 'var(--color-green, #22c55e)',
              color: '#0b1220',
            }}
          >
            {publishing ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
            Publish{savedCount > 0 ? ` (${savedCount})` : ''}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* iframe */}
        {previewUrl ? (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="flex-1 border-none"
            style={{ background: '#fff' }}
            title="PagePilot Preview"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--color-muted)' }}>
            <div className="text-center">
              <p className="text-sm mb-2">Unable to load preview — please log in again.</p>
              <Link
                to="/login"
                className="text-sm font-medium"
                style={{ color: 'var(--color-green)' }}
              >
                Go to login
              </Link>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {previewUrl && !iframeReady && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(11,18,32,0.85)' }}
          >
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-green)' }} />
            <span className="ml-3 text-sm" style={{ color: 'var(--color-text)' }}>
              Loading preview...
            </span>
          </div>
        )}

        {/* Changes panel */}
        {panelOpen && changes.size > 0 && (
          <div
            className="w-80 shrink-0 flex flex-col overflow-hidden border-l"
            style={{ background: 'var(--color-card, #111c2e)', borderColor: 'var(--color-border, #1e293b)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0 border-b"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-subtle)' }}>
                Changes
              </span>
              <button
                onClick={() => setPanelOpen(false)}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'var(--color-subtle)' }}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {Array.from(changes.values()).map((c) => (
                <div
                  key={c.key}
                  className="px-4 py-3 border-b"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <code className="text-[10px] truncate" style={{ color: 'var(--color-green)' }}>
                      {c.key}
                    </code>
                    <StatusDot status={c.status} />
                  </div>
                  <p className="text-xs line-clamp-2" style={{ color: 'var(--color-muted)' }}>
                    {c.value.length > 100 ? c.value.slice(0, 100) + '...' : c.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: '#f59e0b',
    saving: '#3b82f6',
    saved: '#22c55e',
    published: '#a78bfa',
    error: '#ef4444',
  };
  return (
    <span className="flex items-center gap-1 text-[10px]" style={{ color: colors[status] ?? '#94a3b8' }}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: colors[status] ?? '#94a3b8' }}
      />
      {status}
    </span>
  );
}
