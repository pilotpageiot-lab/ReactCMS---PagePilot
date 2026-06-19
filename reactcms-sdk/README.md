# ReactCMS JavaScript SDK

Lightweight (~8 KB) JavaScript SDK for ReactCMS. Works in plain HTML, React, and any JS framework — no dependencies.

## Quick start

```html
<!-- Auto-init: add attributes to the script tag -->
<script
  src="https://cdn.reactcms.io/sdk.js"
  data-key="cms_pk_yourkey"
  data-website="your-website-uuid"
></script>

<!-- Mark elements to manage -->
<h1 data-cms="hero-title" data-cms-fallback="Welcome">Welcome</h1>
<p  data-cms="hero-subtitle">Loading…</p>
<img data-cms="hero-image" src="/placeholder.jpg" alt="Hero" />
```

That's it. The SDK scans the DOM on load, batch-fetches all `data-cms` keys in a single request, and replaces the content. It also watches for new elements added dynamically via MutationObserver.

---

## Attributes

| Attribute | Description | Example |
|---|---|---|
| `data-cms="key"` | **Required.** The content key to fetch | `data-cms="hero-title"` |
| `data-cms-type` | Override how the value is applied | `text` `html` `src` `href` `value` `attr` |
| `data-cms-attr` | Attribute name for `attr` mode | `data-cms-attr="content"` |
| `data-cms-fallback` | Shown if the key is missing or fetch fails | `data-cms-fallback="Default text"` |

### Auto-detected modes

The SDK infers the apply mode from the element tag when `data-cms-type` is not set:

| Element | Inferred mode | What happens |
|---|---|---|
| `<img>` `<video>` `<audio>` | `src` | Sets `src` attribute |
| `<a>` | `href` | Sets `href` attribute |
| `<input>` `<textarea>` | `value` | Sets `.value` property |
| `<meta>` with `data-cms-attr` | `attr` | Sets named attribute |
| Everything else | `text` or `html` | `textContent` or `innerHTML` based on `content_type` |

---

## Script tag attributes

| Attribute | Description | Default |
|---|---|---|
| `data-key` | **Required.** Your API key | — |
| `data-website` | **Required.** Your website UUID | — |
| `data-api-url` | Override the API base URL | `https://api.reactcms.io` |
| `data-preview` | Enable preview / draft mode | `false` |
| `data-cache-ttl` | Cache TTL in milliseconds | `60000` |

---

## Manual init

```html
<script src="https://cdn.reactcms.io/sdk.js"></script>
<script>
  const cms = new ReactCMSClass({
    apiKey:    'cms_pk_yourkey',
    websiteId: 'your-website-uuid',
    preview:   false,
    cacheTtl:  120_000,  // 2 minutes

    onLoad: (key, value, el) => {
      console.log(`Loaded ${key}:`, value);
    },

    onError: (key, err, el) => {
      console.warn(`Failed to load ${key}:`, err.message);
    },
  });

  // Scan & populate the entire page
  await cms.load();

  // Watch for dynamically added [data-cms] elements
  cms.observe();
</script>
```

---

## API

### `cms.load([root])` → `Promise<void>`

Scan `root` (default: `document`) for `[data-cms]` elements and populate them. Safe to call multiple times — subsequent calls serve from cache.

### `cms.loadKey(key, [el])` → `Promise<ContentItem | null>`

Fetch a single key and optionally apply it to an element. Returns the content item.

```js
const item = await cms.loadKey('hero-title');
console.log(item.value);  // 'Welcome to our site'
console.log(item.content_type);  // 'text'
console.log(item.version);  // 3

// Or apply it to a specific element:
const el = document.querySelector('#my-heading');
await cms.loadKey('hero-title', el);
```

### `cms.observe([root])`

Start a `MutationObserver` that watches for new `[data-cms]` elements added to `root` and auto-populates them. Useful for SPAs.

### `cms.stopObserving()`

Stop the MutationObserver.

### `cms.invalidate(key)`

Remove a specific key from both in-memory and localStorage cache. Next `load()` call will re-fetch it.

### `cms.invalidateAll()`

Remove all cached content for this website.

---

## Content types

| `content_type` | Auto mode | Description |
|---|---|---|
| `text` | `textContent` | Plain text |
| `richtext` | `innerHTML` | HTML markup |
| `image` | `src` attribute | Image URL |
| `json` | `textContent` | Raw JSON string |

---

## CSS states

The SDK adds and removes attributes to signal loading state — use them for skeletons:

```css
/* Skeleton shimmer while loading */
[data-cms-loading] {
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
  color: transparent;
}

/* Fade in when loaded */
[data-cms-loaded] {
  animation: fadeIn 0.2s ease;
}

/* Dim on error */
[data-cms-error] {
  opacity: 0.5;
}

@keyframes shimmer {
  0%   { background-position: 200% 0 }
  100% { background-position: -200% 0 }
}
```

---

## Examples

### Plain HTML page

```html
<!DOCTYPE html>
<html>
<head>
  <title data-cms="page-title" data-cms-type="attr" data-cms-attr="content">My Site</title>
</head>
<body>
  <script src="sdk.js" data-key="cms_pk_..." data-website="uuid"></script>

  <h1 data-cms="hero-title" data-cms-fallback="Hello">Hello</h1>
  <p  data-cms="hero-subtitle">Edit me in your dashboard</p>
  <img data-cms="hero-image" src="/placeholder.jpg" alt="Hero" />
  <a  data-cms="cta-url" href="/">
    <span data-cms="cta-label">Get started</span>
  </a>
</body>
</html>
```

### React / Next.js

```tsx
import { useEffect, useRef } from 'react';

declare global {
  interface Window { ReactCMSClass: new (cfg: object) => ReactCMSInstance }
}

export function CMSProvider({ apiKey, websiteId }: { apiKey: string; websiteId: string }) {
  const cms = useRef<ReactCMSInstance | null>(null);

  useEffect(() => {
    if (!window.ReactCMSClass) return;
    cms.current = new window.ReactCMSClass({ apiKey, websiteId });
    cms.current.load().then(() => cms.current?.observe());
    return () => cms.current?.stopObserving();
  }, [apiKey, websiteId]);

  return null;
}
```

### ES module import

```js
import { ReactCMSClass } from 'reactcms-sdk';

const cms = new ReactCMSClass({ apiKey: '...', websiteId: '...' });
await cms.load();
cms.observe();
```

---

## Caching

Content is cached in two layers:

1. **In-memory** (`Map`) — zero-latency, lives for the page session
2. **localStorage** — survives page reloads, uses the same TTL

Cache key format: `rcms_{websiteId}:{cmsKey}`

Both layers are skipped for preview mode (`data-preview="true"`), so draft content is always fetched fresh.

localStorage errors (quota exceeded, private browsing) are silently swallowed — the in-memory cache continues to work.

---

## Rate limiting and retries

The SDK automatically retries on:
- **429 Too Many Requests** — respects `Retry-After` header
- **5xx Server errors** — exponential backoff (100ms, 200ms, 400ms)

Network errors are also retried up to 3 times before the fallback content is shown.

---

## Bundle size

- `dist/sdk.js` — ~8 KB minified, ~3 KB gzipped
- Zero dependencies
- No polyfills required for modern browsers (ES2015+)

---

## Browser support

| Browser | Minimum version |
|---|---|
| Chrome | 61+ |
| Firefox | 60+ |
| Safari | 12+ |
| Edge | 79+ |

Requires: `fetch`, `Promise`, `URL`, `MutationObserver`, `Map`, `localStorage` (optional).
