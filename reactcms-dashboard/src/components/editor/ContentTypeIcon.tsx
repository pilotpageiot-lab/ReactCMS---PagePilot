import { Type, Image, Code2, AlignLeft } from 'lucide-react';
import type { ContentType } from '@/types';

const icons: Record<ContentType, React.ReactNode> = {
  text: <Type size={13} />,
  richtext: <AlignLeft size={13} />,
  image: <Image size={13} />,
  json: <Code2 size={13} />,
};

const labels: Record<ContentType, string> = {
  text: 'Text',
  richtext: 'Rich text',
  image: 'Image URL',
  json: 'JSON',
};

export function ContentTypeIcon({ type }: { type: ContentType }) {
  return <span title={labels[type]}>{icons[type]}</span>;
}

export function contentTypeLabel(type: ContentType): string {
  return labels[type];
}
