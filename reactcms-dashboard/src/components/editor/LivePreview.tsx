import { clsx } from 'clsx';
import DOMPurify from 'dompurify';
import type { ContentType } from '@/types';

interface LivePreviewProps {
  contentType: ContentType;
  value: string;
  cmsKey: string;
}

export function LivePreview({ contentType, value, cmsKey }: LivePreviewProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview</span>
        <span className="ml-auto font-mono text-xs text-gray-400">{cmsKey}</span>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <PreviewContent type={contentType} value={value} />
      </div>
    </div>
  );
}

function PreviewContent({ type, value }: { type: ContentType; value: string }) {
  if (!value) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 italic">
        No content yet
      </div>
    );
  }

  if (type === 'image') {
    return (
      <div className="flex items-center justify-center">
        <img
          src={value}
          alt="Content preview"
          className="max-w-full max-h-80 rounded-lg border border-gray-200 object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  if (type === 'json') {
    let formatted = value;
    let isValid = true;
    try { formatted = JSON.stringify(JSON.parse(value), null, 2); }
    catch { isValid = false; }
    return (
      <pre className={clsx(
        'text-xs font-mono rounded-lg p-4 overflow-auto whitespace-pre-wrap break-all',
        isValid ? 'bg-gray-900 text-emerald-400' : 'bg-red-50 text-red-700',
      )}>
        {isValid ? formatted : `Parse error:\n${value}`}
      </pre>
    );
  }

  if (type === 'richtext') {
    // SECURITY FIX: sanitise before setting innerHTML — defence-in-depth
    // even though the server already sanitises on write
    const clean = DOMPurify.sanitize(value, {
      ALLOWED_TAGS: ['p','strong','em','u','s','del','h2','h3','h4','ul','ol','li','a','blockquote','hr','code','pre','br','span'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    });
    return (
      <div
        className="prose prose-sm max-w-none text-gray-900"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-2xl font-semibold text-gray-900 leading-snug">{value}</div>
      <div className="text-sm text-gray-500 pt-3 border-t border-gray-100">
        {value.length} characters
      </div>
    </div>
  );
}
