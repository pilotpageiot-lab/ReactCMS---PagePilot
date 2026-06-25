import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save, Rocket, List, X, Monitor, Tablet, Smartphone, RefreshCw } from 'lucide-react';
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

type ViewMode = 'desktop' | 'tablet' | 'mobile';
const VIEW_WIDTHS: Record<ViewMode, string> = { desktop: '100%', tablet: '768px', mobile: '375px' };

export function PagePilotPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuthStore();

  const [changes, setChanges] = useState<Map<string, PendingChange>>(new Map());
  const [iframeReady, setIframeReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [elementCount, setElementCount] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'timeout' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: website } = useQuery({
    queryKey: ['website', id],
    queryFn: () => websitesApi.get(id!),
    enabled: !!id,
  });

  // PostMessage bridge with retry logic
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data.type !== 'string') return;

      switch (data.type) {
        case 'pagepilot:ready':
          setIframeReady(true);
          setLoadStatus('ready');
          // Send init immediately, then retry a few more times to ensure SDK listener is ready
          iframeRef.current?.contentWindow?.postMessage({ type: 'pagepilot:init' }, '*');
          setTimeout(() => iframeRef.current?.contentWindow?.postMessage({ type: 'pagepilot:init' }, '*'), 500);
          setTimeout(() => iframeRef.current?.contentWindow?.postMessage({ type: 'pagepilot:init' }, '*'), 1500);
          setTimeout(() => iframeRef.current?.contentWindow?.postMessage({ type: 'pagepilot:init' }, '*'), 3000);
          if (initRetryRef.current) { clearInterval(initRetryRef.current); initRetryRef.current = null; }
          break;
        case 'pagepilot:error':
          setLoadStatus('error');
          setLoadError(data.message ?? 'Failed to load editing tools');
          break;
        case 'pagepilot:elements':
          setElementCount(data.count ?? 0);
          break;
        case 'pagepilot:change':
          setChanges((prev) => {
            const next = new Map(prev);
            next.set(data.key, {
              key: data.key, value: data.value, content_type: data.content_type,
              original: data.original, status: 'pending',
            });
            return next;
          });
          if (!panelOpen) setPanelOpen(true);
          break;
      }
    }
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (initRetryRef.current) clearInterval(initRetryRef.current);
    };
  }, [panelOpen]);

  // Retry sending pagepilot:init every 2s + timeout after 20s
  useEffect(() => {
    if (iframeReady || !iframeRef.current) return;

    const startTime = Date.now();
    initRetryRef.current = setInterval(() => {
      if (iframeReady) { clearInterval(initRetryRef.current!); return; }
      // Keep trying to send init in case the iframe loaded but we missed the ready signal
      iframeRef.current?.contentWindow?.postMessage({ type: 'pagepilot:init' }, '*');
      if (Date.now() - startTime > 20_000) {
        setLoadStatus('timeout');
        clearInterval(initRetryRef.current!);
      }
    }, 2000);

    return () => { if (initRetryRef.current) clearInterval(initRetryRef.current); };
  }, [iframeReady]);

  const pendingCount = Array.from(changes.values()).filter((c) => c.status === 'pending').length;
  const savedCount = Array.from(changes.values()).filter((c) => c.status === 'saved').length;

  const saveAll = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    const pending = Array.from(changes.values()).filter((c) => c.status === 'pending');
    pending.forEach((c) => setChanges((p) => { const n = new Map(p); n.set(c.key, { ...c, status: 'saving' }); return n; }));
    const results = await Promise.allSettled(
      pending.map((change) =>
        contentApi.upsert(id, change.key, { content_type: change.content_type, value: change.value })
          .then(() => { setChanges((p) => { const n = new Map(p); n.set(change.key, { ...change, status: 'saved' }); return n; }); })
          .catch(() => { setChanges((p) => { const n = new Map(p); n.set(change.key, { ...change, status: 'error' }); return n; }); })
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    setSaving(false);
    if (failed > 0) toast.error(`${failed} save(s) failed`);
    else if (pending.length > 0) toast.success(`Saved ${pending.length} draft(s)`);
  }, [id, changes]);

  const publishAll = useCallback(async () => {
    if (!id) return;
    setPublishing(true);
    const saved = Array.from(changes.values()).filter((c) => c.status === 'saved');
    let count = 0;
    for (const change of saved) {
      try {
        await contentApi.publish(id, change.key);
        setChanges((p) => { const n = new Map(p); n.set(change.key, { ...change, status: 'published' }); return n; });
        count++;
      } catch { toast.error(`Failed to publish ${change.key}`); }
    }
    setPublishing(false);
    if (count > 0) toast.success(`Published ${count} key(s)`);
  }, [id, changes]);

  const reloadPreview = () => {
    setIframeReady(false);
    setLoadStatus('loading');
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  if (!id) return <Navigate to="/websites" replace />;
  // Don't hard-redirect to login — show inline message instead so user doesn't lose context
  if (!isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#070d18' }}>
        <div className="text-center">
          <p className="text-sm mb-3" style={{ color: '#e2e8f0' }}>Your session has expired.</p>
          <Link to="/login" className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg" style={{ background: '#22c55e', color: '#0b1220' }}>
            Sign in again
          </Link>
        </div>
      </div>
    );
  }

  const token = getAccessToken();
  const previewUrl = token ? `${API_URL}/sdk/v1/preview/${id}?token=${encodeURIComponent(token)}` : null;

  return (
    <div className="h-screen flex flex-col" style={{ background: '#070d18' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 shrink-0" style={{ height: 48, background: '#0b1220', borderBottom: '1px solid #1e293b' }}>
        <Link to={`/websites/${id}`} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: '#94a3b8' }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="w-px h-5" style={{ background: '#1e293b' }} />
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded bg-[#22c55e] flex items-center justify-center shrink-0">
            <span className="text-[8px] font-black text-[#0b1220]">PP</span>
          </div>
          <span className="text-sm font-semibold truncate hidden sm:inline" style={{ color: '#e2e8f0' }}>
            {website?.name ?? '...'}
          </span>
        </div>

        {/* Viewport switcher */}
        <div className="hidden md:flex items-center gap-0.5 ml-3 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {([
            { mode: 'desktop' as ViewMode, icon: <Monitor size={14} /> },
            { mode: 'tablet' as ViewMode, icon: <Tablet size={14} /> },
            { mode: 'mobile' as ViewMode, icon: <Smartphone size={14} /> },
          ]).map(({ mode, icon }) => (
            <button key={mode} onClick={() => setViewMode(mode)} className="p-1.5 rounded-md transition-colors"
              style={{ color: viewMode === mode ? '#22c55e' : '#64748b', background: viewMode === mode ? 'rgba(34,197,94,0.1)' : 'transparent' }}
              title={mode}>{icon}</button>
          ))}
        </div>

        {iframeReady && elementCount > 0 && (
          <span className="text-[10px] hidden lg:inline ml-2" style={{ color: '#475569' }}>{elementCount} editable</span>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {changes.size > 0 && (
            <button onClick={() => setPanelOpen(!panelOpen)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded-md transition-colors"
              style={{ color: pendingCount > 0 ? '#f59e0b' : '#22c55e', background: pendingCount > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)', border: '1px solid ' + (pendingCount > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)') }}>
              <List size={11} />
              <span className="hidden sm:inline">{changes.size} change{changes.size !== 1 ? 's' : ''}</span>
              <span className="sm:hidden">{changes.size}</span>
            </button>
          )}
          <button onClick={saveAll} disabled={saving || pendingCount === 0}
            className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold rounded-lg transition-all disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #1e293b', color: '#e2e8f0' }}>
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            <span className="hidden sm:inline">Save{pendingCount > 0 ? ` (${pendingCount})` : ''}</span>
          </button>
          <button onClick={publishAll} disabled={publishing || savedCount === 0}
            className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-bold rounded-lg transition-all disabled:opacity-30"
            style={{ background: '#22c55e', color: '#0b1220' }}>
            {publishing ? <Loader2 size={11} className="animate-spin" /> : <Rocket size={11} />}
            <span className="hidden sm:inline">Publish{savedCount > 0 ? ` (${savedCount})` : ''}</span>
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 flex items-start justify-center overflow-auto" style={{ background: '#070d18' }}>
          {previewUrl ? (
            <iframe ref={iframeRef} src={previewUrl} className="border-none transition-all duration-300"
              style={{ width: VIEW_WIDTHS[viewMode], maxWidth: '100%', height: '100%', background: '#fff',
                boxShadow: viewMode !== 'desktop' ? '0 0 40px rgba(0,0,0,0.5)' : 'none',
                borderRadius: viewMode !== 'desktop' ? '8px' : '0',
                margin: viewMode !== 'desktop' ? '16px auto' : '0' }}
              title="PagePilot Preview" />
          ) : (
            <div className="flex-1 flex items-center justify-center h-full" style={{ color: '#64748b' }}>
              <div className="text-center">
                <p className="text-sm mb-2">Session expired — please log in again.</p>
                <Link to="/login" className="text-sm font-medium" style={{ color: '#22c55e' }}>Log in</Link>
              </div>
            </div>
          )}
        </div>

        {/* Loading / timeout overlay */}
        {previewUrl && !iframeReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ background: 'rgba(7,13,24,0.92)' }}>
            {loadStatus === 'loading' && (
              <>
                <Loader2 size={24} className="animate-spin" style={{ color: '#22c55e' }} />
                <span className="text-xs" style={{ color: '#64748b' }}>Loading website preview…</span>
                <span className="text-[10px]" style={{ color: '#334155' }}>This may take a moment on first load</span>
              </>
            )}
            {(loadStatus === 'timeout' || loadStatus === 'error') && (
              <>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: loadStatus === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)' }}>
                  <RefreshCw size={20} style={{ color: loadStatus === 'error' ? '#ef4444' : '#f59e0b' }} />
                </div>
                <span className="text-sm font-medium" style={{ color: '#e2e8f0' }}>
                  {loadStatus === 'error' ? (loadError || 'Failed to load editing tools') : 'Preview is taking longer than usual'}
                </span>
                <span className="text-xs text-center max-w-xs" style={{ color: '#64748b' }}>
                  {loadStatus === 'error' ? 'The SDK could not be loaded. Check the website URL and try again.' : 'The server may be waking up from a cold start. Click retry to try again.'}
                </span>
                <button onClick={reloadPreview}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors"
                  style={{ background: '#22c55e', color: '#0b1220' }}>
                  <RefreshCw size={12} /> Retry
                </button>
              </>
            )}
          </div>
        )}

        {/* Changes panel */}
        {panelOpen && changes.size > 0 && (
          <div className="w-72 sm:w-80 shrink-0 flex flex-col overflow-hidden" style={{ background: '#0b1220', borderLeft: '1px solid #1e293b' }}>
            <div className="flex items-center justify-between px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid #1e293b' }}>
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Changes</span>
              <button onClick={() => setPanelOpen(false)} className="p-0.5 rounded hover:bg-white/5 transition-colors" style={{ color: '#475569' }}><X size={13} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {Array.from(changes.values()).map((c) => (
                <div key={c.key} className="px-4 py-2.5" style={{ borderBottom: '1px solid #111c2e' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-[10px] truncate" style={{ color: '#22c55e' }}>{c.key}</code>
                    <StatusDot status={c.status} />
                  </div>
                  <p className="text-[11px] line-clamp-2" style={{ color: '#64748b' }}>
                    {c.value.length > 80 ? c.value.slice(0, 80) + '…' : c.value}
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
    pending: '#f59e0b', saving: '#3b82f6', saved: '#22c55e', published: '#a78bfa', error: '#ef4444',
  };
  const c = colors[status] ?? '#475569';
  return (
    <span className="flex items-center gap-1 text-[9px] font-medium" style={{ color: c }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {status}
    </span>
  );
}
