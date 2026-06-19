import { useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import type { ContentType } from '@/types';

interface ValueEditorProps {
  contentType: ContentType;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function ValueEditor({ contentType, value, onChange, disabled }: ValueEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const base = clsx(
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
    'placeholder:text-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
    'hover:border-gray-300',
  );

  if (contentType === 'text') {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Enter text content…"
        className={clsx(base, 'h-9')}
      />
    );
  }

  if (contentType === 'image') {
    return (
      <div className="space-y-2">
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="https://example.com/image.webp"
          className={clsx(base, 'h-9')}
        />
        {value && (
          <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            <img
              src={value}
              alt="Preview"
              className="max-h-48 w-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>
    );
  }

  if (contentType === 'json') {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder='{"key": "value"}'
        rows={6}
        spellCheck={false}
        className={clsx(base, 'font-mono text-xs resize-none min-h-32')}
      />
    );
  }

  // richtext
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="<p>Enter rich text or HTML…</p>"
      rows={8}
      spellCheck={false}
      className={clsx(base, 'resize-none min-h-40 leading-relaxed')}
    />
  );
}
