import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, Globe, EyeOff, Clock, FileText, Scan, ArrowLeft, AlertTriangle, MousePointerClick } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ValueEditor } from '@/components/editor/ValueEditor';
import { LivePreview } from '@/components/editor/LivePreview';
import { VersionHistory } from '@/components/editor/VersionHistory';
import { ContentTypeIcon, contentTypeLabel } from '@/components/editor/ContentTypeIcon';
import { ScanWebsiteModal } from '@/components/scan/ScanWebsiteModal';
import { contentApi } from '@/api/content';
import { ApiError } from '@/lib/api-client';
import { formatRelative } from '@/lib/date';
import type { ContentItem, ContentType } from '@/types';

const CONTENT_TYPES: ContentType[] = ['text', 'richtext', 'image', 'json'];

// ── Content row (left panel list item) ───────────────────────────────────────

function humanizeKey(key: string): string {
  return key.replace(/^[a-z]-/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ContentRow({
  item,
  selected,
  onClick,
  onDelete,
}: {
  item: ContentItem;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const preview = item.value
    ? item.value.replace(/<[^>]*>/g, '').slice(0, 50) + (item.value.length > 50 ? '…' : '')
    : '';

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group flex items-start gap-3 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer transition-all border-l-2',
        selected
          ? 'bg-indigo-50 border-l-indigo-600'
          : 'border-l-transparent hover:bg-gray-50',
      )}
    >
      {/* Type badge */}
      <div
        className={clsx(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold uppercase',
          item.content_type === 'richtext' ? 'bg-purple-100 text-purple-600' :
          item.content_type === 'image'    ? 'bg-blue-100 text-blue-600' :
          item.content_type === 'json'     ? 'bg-amber-100 text-amber-600' :
                                             'bg-gray-100 text-gray-500',
          selected && 'ring-2 ring-indigo-300',
        )}
      >
        <ContentTypeIcon type={item.content_type as ContentType} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Human-readable name */}
        <p className={clsx('text-[13px] font-medium truncate leading-tight', selected ? 'text-indigo-700' : 'text-gray-900')}>
          {humanizeKey(item.cms_key)}
        </p>
        {/* Key name + preview */}
        <p className="text-[10px] font-mono text-gray-400 truncate mt-0.5">
          {item.cms_key}
        </p>
        {preview && (
          <p className="text-[11px] text-gray-400 truncate mt-1 leading-snug">
            {preview}
          </p>
        )}
      </div>

      {/* Status + actions */}
      <div className="flex flex-col items-end gap-1 shrink-0 mt-0.5">
        {item.is_published ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
            <Globe size={8} /> Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[9px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
            <EyeOff size={8} /> Draft
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 rounded transition-all"
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Editor panel ──────────────────────────────────────────────────────────────

function EditorPanel({
  item,
  websiteId,
  onSaved,
  onBack,
}: {
  item: ContentItem;
  websiteId: string;
  onSaved: () => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(item.value ?? '');
  const [contentType, setContentType] = useState<ContentType>(item.content_type as ContentType);
  const [showVersions, setShowVersions] = useState(false);
  const isDirty = value !== (item.value ?? '') || contentType !== item.content_type;

  const saveMutation = useMutation({
    mutationFn: () =>
      contentApi.upsert(websiteId, item.cms_key, { content_type: contentType, value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', websiteId] });
      toast.success('Saved');
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Save failed'),
  });

  const publishMutation = useMutation({
    mutationFn: () => contentApi.publish(websiteId, item.cms_key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', websiteId] });
      toast.success('Published');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Publish failed'),
  });

  const restoreMutation = useMutation({
    mutationFn: (version: number) => contentApi.restore(websiteId, item.cms_key, version),
    onSuccess: (restored) => {
      setValue(restored.value ?? '');
      queryClient.invalidateQueries({ queryKey: ['content', websiteId] });
      toast.success(`Restored to v${restored.version}`);
    },
    onError: () => toast.error('Restore failed'),
  });

  const { data: versionsData } = useQuery({
    queryKey: ['versions', websiteId, item.cms_key],
    queryFn: () => contentApi.listVersions(websiteId, item.cms_key),
    enabled: showVersions,
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Editor toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-gray-100 bg-white shrink-0">
        {/* Back button (mobile only) */}
        <button
          onClick={onBack}
          className="md:hidden p-1 text-gray-400 hover:text-gray-700 rounded-md transition-colors"
          aria-label="Back to list"
        >
          <ArrowLeft size={16} />
        </button>

        {/* Unsaved indicator */}
        <div className={clsx(
          'w-2 h-2 rounded-full transition-colors shrink-0',
          isDirty ? 'bg-amber-400 animate-pulse' : 'bg-gray-200',
        )} title={isDirty ? 'Unsaved changes' : 'Saved'} />

        <span className="font-mono text-xs sm:text-sm text-gray-700 font-medium truncate min-w-0">{item.cms_key}</span>

        {/* Content type selector */}
        <select
          value={contentType}
          onChange={(e) => setContentType(e.target.value as ContentType)}
          className="h-7 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>{contentTypeLabel(t)}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setShowVersions(!showVersions)}
            className={clsx(
              'hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors',
              showVersions
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
            )}
          >
            <Clock size={12} />
            History
          </button>
          {isDirty ? (
            <Button
              size="sm"
              variant="primary"
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save draft
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              loading={publishMutation.isPending}
              onClick={() => publishMutation.mutate()}
            >
              {item.is_published ? 'Re-publish' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      {/* Split: editor + preview (+ optional history panel) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Editor */}
        <div className={clsx(
          'flex flex-col overflow-y-auto',
          showVersions ? 'lg:w-2/5' : 'lg:w-1/2',
          'min-h-0 flex-1 lg:flex-none',
        )}>
          <div className="p-3 sm:p-4 flex-1">
            <ValueEditor
              contentType={contentType}
              value={value}
              onChange={setValue}
              disabled={saveMutation.isPending}
            />
          </div>

          {/* Meta */}
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex flex-wrap items-center gap-2 sm:gap-4">
            <span>v{item.version}</span>
            <span className="hidden sm:inline">·</span>
            <span>Updated {formatRelative(item.updated_at)}</span>
            {item.published_at && (
              <>
                <span className="hidden sm:inline">·</span>
                <span className="text-emerald-600">Published {formatRelative(item.published_at)}</span>
              </>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="relative bg-gray-100 shrink-0 h-px lg:h-auto lg:w-px">
          {isDirty && (
            <div className="absolute inset-0 bg-indigo-400 animate-pulse" style={{ animationDuration: '2s' }} />
          )}
        </div>

        {/* Live preview */}
        <div className={clsx(
          'overflow-y-auto bg-white min-h-0 flex-1 lg:flex-none',
          showVersions ? 'lg:w-1/5' : 'lg:w-1/2',
        )}>
          <LivePreview contentType={contentType} value={value} cmsKey={item.cms_key} />
        </div>

        {/* Version history panel */}
        {showVersions && (
          <>
            <div className="hidden lg:block w-px bg-gray-100 shrink-0" />
            <div className="lg:w-2/5 overflow-y-auto bg-white border-t lg:border-t-0 border-gray-100">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Version history</h3>
              </div>
              <div className="px-4">
                <VersionHistory
                  versions={versionsData?.data ?? []}
                  currentVersion={item.version}
                  onRestore={(v) => restoreMutation.mutate(v)}
                  restoring={restoreMutation.isPending}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Footer stats with progress bar ───────────────────────────────────────────

function FooterStats({ items, onDeleteAll }: { items: ContentItem[]; onDeleteAll: () => void }) {
  const published = items.filter((i) => i.is_published).length;
  const pct = items.length > 0 ? Math.round((published / items.length) * 100) : 0;

  return (
    <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-t border-gray-100 space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span className="font-medium">{published}/{items.length} published ({pct}%)</span>
        <button
          onClick={onDeleteAll}
          className="text-[10px] text-red-400 hover:text-red-600 font-medium transition-colors"
        >
          Delete all
        </button>
      </div>
      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#6366f1' }}
        />
      </div>
    </div>
  );
}

// ── Main content tab ──────────────────────────────────────────────────────────

export function ContentTab({ websiteId, customDomain }: { websiteId: string; customDomain?: string | null }) {
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [filterType, setFilterType] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['content', websiteId, { search, filterType }],
    queryFn: () =>
      contentApi.list(websiteId, {
        search: search || undefined,
        type: filterType || undefined,
        per_page: 200,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => contentApi.delete(websiteId, key),
    onSuccess: (_, key) => {
      queryClient.invalidateQueries({ queryKey: ['content', websiteId] });
      if (selectedKey === key) setSelectedKey(null);
      setDeletingKey(null);
      toast.success('Content key deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => contentApi.deleteAll(websiteId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['content', websiteId] });
      setSelectedKey(null);
      setDeleteAllOpen(false);
      toast.success(`Deleted ${data.deleted} content keys`);
    },
    onError: () => toast.error('Delete all failed'),
  });

  const items = data?.data ?? [];
  const selectedItem = items.find((i) => i.cms_key === selectedKey);

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0">
      {/* Left panel: content list — full width on mobile, fixed sidebar on md+ */}
      <div className={clsx(
        'flex flex-col border-r border-gray-100 bg-white',
        'w-full md:w-80 md:shrink-0',
        selectedItem ? 'hidden md:flex' : 'flex',
      )}>
        {/* Search + new */}
        <div className="p-3 border-b border-gray-100 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search keys…"
                className="w-full h-8 pl-7 pr-3 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Scan size={12} />}
              onClick={() => setScanOpen(true)}
              className="shrink-0 h-8"
            >
              Scan
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={12} />}
              onClick={() => setNewKeyOpen(true)}
              className="shrink-0 h-8"
            >
              New
            </Button>
          </div>

          {/* Type filter with counts */}
          <div className="flex gap-1 overflow-x-auto">
            {['', ...CONTENT_TYPES].map((t) => {
              const count = t ? items.filter((i) => i.content_type === t).length : items.length;
              return (
                <button
                  key={t || 'all'}
                  onClick={() => setFilterType(t)}
                  className={clsx(
                    'px-2 py-1 text-[11px] rounded-md transition-colors font-medium whitespace-nowrap flex items-center gap-1',
                    filterType === t
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-500 hover:bg-gray-100',
                  )}
                >
                  {t || 'All'}
                  {count > 0 && (
                    <span className={clsx(
                      'text-[9px] min-w-[14px] h-[14px] flex items-center justify-center rounded-full',
                      filterType === t ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-200 text-gray-500',
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<FileText size={18} />}
              title={search ? 'No results' : 'No content yet'}
              description={search ? 'Try a different search.' : 'Add your first content key to get started.'}
              action={
                !search ? { label: 'Add key', onClick: () => setNewKeyOpen(true) } : undefined
              }
            />
          ) : (
            items.map((item) => (
              <ContentRow
                key={item.cms_key}
                item={item}
                selected={selectedKey === item.cms_key}
                onClick={() => setSelectedKey(item.cms_key)}
                onDelete={() => setDeletingKey(item.cms_key)}
              />
            ))
          )}
        </div>

        {/* Footer stats with progress */}
        {items.length > 0 && (
          <FooterStats items={items} onDeleteAll={() => setDeleteAllOpen(true)} />
        )}
      </div>

      {/* Right panel: editor — full width on mobile when key is selected */}
      <div className={clsx(
        'flex-1 overflow-hidden min-h-0',
        selectedItem ? 'flex flex-col' : 'hidden md:flex md:flex-col',
      )}>
        {selectedItem ? (
          <EditorPanel
            key={selectedItem.cms_key}
            item={selectedItem}
            websiteId={websiteId}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['content', websiteId] })}
            onBack={() => setSelectedKey(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4 text-gray-300">
              <MousePointerClick size={24} />
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Select a content key</p>
            <p className="text-xs text-gray-400 leading-relaxed mb-5">
              {items.length > 0
                ? 'Pick any key from the left panel to view and edit its content.'
                : 'Start by creating your first content key or scanning your website.'}
            </p>
            {items.length > 0 ? (
              <div className="flex flex-wrap gap-4 text-[10px] text-gray-400">
                <div className="flex items-center gap-1.5"><Globe size={10} className="text-emerald-500" /> {items.filter(i => i.is_published).length} published</div>
                <div className="flex items-center gap-1.5"><EyeOff size={10} /> {items.filter(i => !i.is_published).length} drafts</div>
                <div className="flex items-center gap-1.5"><FileText size={10} /> {items.length} total</div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="primary" icon={<Plus size={12} />} onClick={() => setNewKeyOpen(true)}>New key</Button>
                <Button size="sm" variant="secondary" icon={<Scan size={12} />} onClick={() => setScanOpen(true)}>Scan site</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New key modal */}
      <NewKeyModal
        open={newKeyOpen}
        onClose={() => setNewKeyOpen(false)}
        websiteId={websiteId}
        onCreated={(key) => {
          queryClient.invalidateQueries({ queryKey: ['content', websiteId] });
          setSelectedKey(key);
          setNewKeyOpen(false);
        }}
      />

      {/* Delete confirm */}
      <Modal
        open={deletingKey !== null}
        onClose={() => setDeletingKey(null)}
        title="Delete content key"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-1">
          Delete <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{deletingKey}</code>?
        </p>
        <p className="text-sm text-gray-500 mb-5">All version history will be permanently removed.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeletingKey(null)}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleteMutation.isPending}
            onClick={() => deletingKey && deleteMutation.mutate(deletingKey)}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Delete all confirm */}
      <Modal
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        title="Delete all content"
        size="sm"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={16} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-700 font-medium">
              Delete all {items.length} content key{items.length !== 1 ? 's' : ''}?
            </p>
            <p className="text-sm text-gray-500 mt-1">
              This will permanently remove all content and version history. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteAllOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleteAllMutation.isPending}
            onClick={() => deleteAllMutation.mutate()}
          >
            Delete all
          </Button>
        </div>
      </Modal>

      {/* Scan website modal */}
      <ScanWebsiteModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        websiteId={websiteId}
        customDomain={customDomain ?? null}
      />
    </div>
  );
}

// ── New key modal ─────────────────────────────────────────────────────────────

function NewKeyModal({
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
  const [key, setKey] = useState('');
  const [contentType, setContentType] = useState<ContentType>('text');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await contentApi.upsert(websiteId, key, { content_type: contentType, value });
      onCreated(key);
      setKey('');
      setValue('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New content key">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Key name"
          value={key}
          onChange={(e) => setKey(e.target.value.replace(/[^a-zA-Z0-9_\-\.]/g, ''))}
          placeholder="hero-title"
          pattern="[a-zA-Z0-9_\-\.]+"
          hint="Used in data-cms=&quot;key-name&quot; on your website"
          required
          autoFocus
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Content type</label>
          <div className="flex gap-2">
            {CONTENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setContentType(t)}
                className={clsx(
                  'flex-1 py-2 text-xs rounded-lg border font-medium transition-colors',
                  contentType === t
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300',
                )}
              >
                {contentTypeLabel(t)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Initial value <span className="text-gray-400 font-normal">(optional)</span></label>
          <ValueEditor contentType={contentType} value={value} onChange={setValue} />
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
