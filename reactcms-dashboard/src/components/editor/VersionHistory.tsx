import { formatRelative } from '@/lib/date';
import { Button } from '@/components/ui/Button';
import { RotateCcw } from 'lucide-react';
import type { ContentVersion } from '@/types';

interface VersionHistoryProps {
  versions: ContentVersion[];
  currentVersion: number;
  onRestore: (version: number) => void;
  restoring: boolean;
}

export function VersionHistory({ versions, currentVersion, onRestore, restoring }: VersionHistoryProps) {
  if (versions.length === 0) {
    return <p className="text-sm text-gray-500 py-4 text-center">No previous versions</p>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {versions.map((v) => (
        <div key={v.version} className="flex items-start gap-3 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500">v{v.version}</span>
              {v.version === currentVersion && (
                <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                  current
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {v.changed_by} · {formatRelative(v.created_at)}
            </p>
            {v.value && (
              <p className="text-xs text-gray-700 mt-1.5 truncate font-mono bg-gray-50 px-2 py-1 rounded">
                {v.value.slice(0, 80)}{v.value.length > 80 ? '…' : ''}
              </p>
            )}
          </div>
          {v.version !== currentVersion && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={12} />}
              loading={restoring}
              onClick={() => onRestore(v.version)}
            >
              Restore
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
