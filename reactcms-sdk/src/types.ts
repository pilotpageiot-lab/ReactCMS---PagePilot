export interface ReactCMSConfig {
  /** API key (cms_pk_... or cms_sk_...) */
  apiKey: string;
  /** Website UUID — must match the key's website */
  websiteId: string;
  /** Override the default API base URL */
  apiUrl?: string;
  /** Enable preview (draft) mode — requires write-scoped key */
  preview?: boolean;
  /** Content cache TTL in milliseconds (default: 60000) */
  cacheTtl?: number;
  /** Called when any content item is resolved */
  onLoad?: (key: string, value: string | null, el: Element) => void;
  /** Called when a fetch or apply error occurs */
  onError?: (key: string, error: Error, el: Element | null) => void;
}

export type ContentType = 'text' | 'richtext' | 'image' | 'json';

export interface ContentItem {
  key: string;
  content_type: ContentType;
  value: string | null;
  metadata: Record<string, unknown>;
  version: number;
}

export interface BatchResponse {
  data: Record<string, ContentItem>;
  missing: string[];
}

export interface CacheEntry {
  item: ContentItem;
  expiresAt: number;
}

export type ContentApplyMode =
  | 'text'       // el.textContent = value
  | 'html'       // el.innerHTML  = value
  | 'src'        // el.setAttribute('src', value)
  | 'href'       // el.setAttribute('href', value)
  | 'attr'       // el.setAttribute(data-cms-attr, value)
  | 'value'      // (input/textarea) el.value = value
  | 'auto';      // inferred from tag + content_type

export interface ResolvedElement {
  el: Element;
  key: string;
  mode: ContentApplyMode;
  attrName?: string;   // for mode='attr'
  fallback: string;
}
