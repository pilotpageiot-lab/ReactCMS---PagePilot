import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Scan, Check, AlertCircle, Loader2, Globe, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { contentApi } from '@/api/content';
import { ApiError } from '@/lib/api-client';
import type { ScannedItem } from '@/types';

type Phase = 'input' | 'scanning' | 'results';

export function ScanWebsiteModal({
  open,
  onClose,
  websiteId,
  customDomain,
}: {
  open: boolean;
  onClose: () => void;
  websiteId: string;
  customDomain: string | null;
}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('input');
  const [url, setUrl] = useState(customDomain ?? '');
  const [items, setItems] = useState<(ScannedItem & { selected: boolean })[]>([]);
  const [scanStats, setScanStats] = useState({ total: 0, new_count: 0 });

  const scanMutation = useMutation({
    mutationFn: (scanUrl: string) => contentApi.scan(websiteId, scanUrl),
    onSuccess: (data) => {
      setItems(data.items.map((item) => ({ ...item, selected: !item.exists })));
      setScanStats({ total: data.total, new_count: data.new_count });
      setPhase('results');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Scan failed — check the URL and try again');
      setPhase('input');
    },
  });

  const importMutation = useMutation({
    mutationFn: () => {
      const selected = items.filter((i) => i.selected && !i.exists);
      return contentApi.importBatch(
        websiteId,
        selected.map((i) => ({ key: i.key, value: i.value, content_type: i.content_type })),
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['content', websiteId] });
      toast.success(`Imported ${data.created.length} content keys`);
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Import failed'),
  });

  function handleClose() {
    setPhase('input');
    setItems([]);
    onClose();
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setPhase('scanning');
    scanMutation.mutate(url.trim());
  }

  function toggleItem(key: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, selected: !i.selected } : i)));
  }

  function toggleAll(selected: boolean) {
    setItems((prev) => prev.map((i) => (i.exists ? i : { ...i, selected })));
  }

  const selectedCount = items.filter((i) => i.selected && !i.exists).length;

  return (
    <Modal open={open} onClose={handleClose} title="Scan Website" size="xl">
      {phase === 'input' && (
        <form onSubmit={handleScan} className="flex flex-col gap-4">
          <p className="text-xs sm:text-sm text-gray-600">
            Enter your website URL to scan for text elements. We'll find all headings, paragraphs,
            and other text content that can be managed through the CMS.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yoursite.com"
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400"
                required
                autoFocus
              />
            </div>
            <Button type="submit" variant="primary" size="md" icon={<Scan size={14} />} className="shrink-0">
              Scan
            </Button>
          </div>
        </form>
      )}

      {phase === 'scanning' && (
        <div className="flex flex-col items-center justify-center py-10 sm:py-12 gap-3">
          <Loader2 size={28} className="animate-spin text-indigo-500" />
          <p className="text-sm text-gray-600 text-center px-4">Scanning {url}…</p>
          <p className="text-xs text-gray-400">Fetching HTML and discovering text elements</p>
        </div>
      )}

      {phase === 'results' && (
        <div className="flex flex-col gap-3">
          {/* Stats bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="default">{scanStats.total} found</Badge>
              <Badge variant="success">{scanStats.new_count} new</Badge>
              <Badge variant="warning">{scanStats.total - scanStats.new_count} existing</Badge>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Select all
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                Deselect all
              </button>
            </div>
          </div>

          {/* Items list */}
          <div className="border border-gray-200 rounded-lg max-h-60 sm:max-h-80 lg:max-h-96 overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                <AlertCircle size={20} className="mx-auto mb-2 text-gray-400" />
                No text elements found on this page.
              </div>
            ) : (
              items.map((item) => (
                <label
                  key={item.key}
                  className={clsx(
                    'flex items-start gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-2 sm:py-2.5 cursor-pointer transition-colors',
                    item.exists
                      ? 'bg-gray-50 opacity-60'
                      : item.selected
                        ? 'bg-indigo-50/50'
                        : 'hover:bg-gray-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    disabled={item.exists}
                    onChange={() => toggleItem(item.key)}
                    className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <code className="text-[10px] sm:text-xs font-mono text-gray-700 bg-gray-100 px-1 sm:px-1.5 py-0.5 rounded truncate max-w-[200px] sm:max-w-none">
                        {item.key}
                      </code>
                      <Badge
                        variant={item.tag.startsWith('h') ? 'indigo' : 'default'}
                        size="sm"
                      >
                        &lt;{item.tag}&gt;
                      </Badge>
                      {item.content_type === 'richtext' && (
                        <Badge variant="warning" size="sm">richtext</Badge>
                      )}
                      {item.exists && (
                        <Badge variant="success" size="sm">
                          <Check size={10} className="mr-0.5" /> exists
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1 line-clamp-2 sm:truncate">
                      {item.value.length > 120 ? item.value.slice(0, 120) + '…' : item.value}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
            <p className="text-xs text-gray-500">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected for import
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPhase('input')}>
                Scan again
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Download size={12} />}
                loading={importMutation.isPending}
                disabled={selectedCount === 0}
                onClick={() => importMutation.mutate()}
              >
                Import {selectedCount} key{selectedCount !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
