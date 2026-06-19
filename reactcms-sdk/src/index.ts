/**
 * ReactCMS JavaScript SDK
 *
 * Usage A — auto-init via script tag attributes (zero config):
 *   <script
 *     src="https://cdn.reactcms.io/sdk.js"
 *     data-key="cms_pk_yourkey"
 *     data-website="your-website-uuid"
 *   ></script>
 *
 * Usage B — manual init (full control):
 *   <script src="https://cdn.reactcms.io/sdk.js"></script>
 *   <script>
 *     const cms = new ReactCMS({ apiKey: '...', websiteId: '...' });
 *     cms.load();
 *   </script>
 *
 * Usage C — ES module import:
 *   import { ReactCMS } from 'reactcms-sdk';
 *   const cms = new ReactCMS({ apiKey: '...', websiteId: '...' });
 *   await cms.load();
 *   cms.observe(); // watch for dynamic content
 */

import { ReactCMS } from './sdk';
import { readScriptConfig } from './dom';
import { SDK_VERSION, LOG_PREFIX } from './constants';
import type { ReactCMSConfig } from './types';

export { ReactCMS };
export type { ReactCMSConfig };

// ── Auto-initialisation ───────────────────────────────────────────────────────

function autoInit(): void {
  const scriptConfig = readScriptConfig();

  // No data-key on the script tag → don't auto-init
  if (!scriptConfig.apiKey) return;

  if (!scriptConfig.websiteId) {
    console.warn(`${LOG_PREFIX} data-website attribute missing on <script> tag — auto-init skipped`);
    return;
  }

  const cms = new ReactCMS({
    apiKey: scriptConfig.apiKey,
    websiteId: scriptConfig.websiteId,
    apiUrl: scriptConfig.apiUrl,
    preview: scriptConfig.preview,
    cacheTtl: scriptConfig.cacheTtl,
  });

  // Expose the instance globally so page scripts can call cms.loadKey(), etc.
  (window as Record<string, unknown>)['ReactCMS'] = cms;
  (window as Record<string, unknown>)['ReactCMSClass'] = ReactCMS;

  const run = async () => {
    try {
      if (scriptConfig.autoDiscover) {
        await cms.discover();
      }
      await cms.load();
      cms.observe();
    } catch (err) {
      console.error(`${LOG_PREFIX} Auto-init failed`, err);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    // Already past DOMContentLoaded (async/defer script, or script at end of body)
    run();
  }
}

// ── UMD / global export ───────────────────────────────────────────────────────

// When loaded as a plain <script>, expose ReactCMS as a global constructor
if (typeof window !== 'undefined') {
  (window as Record<string, unknown>)['ReactCMSClass'] = ReactCMS;
  autoInit();
}
