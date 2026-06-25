/*!
 * ReactCMS SDK v1.0.0
 * Lightweight content delivery SDK for plain HTML, React, and JS websites.
 * https://reactcms.io  |  MIT License
 *
 * Auto-init via script attributes:
 *   <script src="sdk.js" data-key="cms_pk_..." data-website="uuid"></script>
 *
 * Manual init:
 *   <script src="sdk.js"></script>
 *   <script>
 *     const cms = new ReactCMSClass({ apiKey:'...', websiteId:'...' });
 *     cms.load().then(() => cms.observe());
 *   </script>
 *
 * ES module / CommonJS:
 *   const { ReactCMSClass } = require('reactcms-sdk');
 *   // or: import { ReactCMSClass } from 'reactcms-sdk';
 */
(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = { ReactCMSClass: factory() };
  } else if (typeof define === 'function' && define.amd) {
    define(function () { return { ReactCMSClass: factory() }; });
  } else {
    var g = typeof globalThis !== 'undefined' ? globalThis : global || self;
    g.ReactCMSClass = factory();
  }
})(this, function () {
  'use strict';

  /* ─── Constants ─────────────────────────────────────────────────────────── */

  var V            = '1.0.0';
  var API_URL      = 'https://api.reactcms.io';
  var CACHE_TTL    = 300000; // 5 minutes
  var BATCH_MAX    = 50;
  var MAX_RETRY    = 3;
  var RETRY_BASE   = 100;
  var STORE_PFX    = 'rcms_';
  var A_KEY        = 'data-cms';
  var A_TYPE       = 'data-cms-type';
  var A_ATTR       = 'data-cms-attr';
  var A_FALLBACK   = 'data-cms-fallback';
  var TAG          = '[ReactCMS]';

  /* ─── Tiny helpers ──────────────────────────────────────────────────────── */

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function delay(attempt, header) {
    if (header) { var s = parseInt(header, 10); if (!isNaN(s)) return s * 1000; }
    return RETRY_BASE * Math.pow(2, attempt);
  }

  function retryable(status) { return status === 429 || status >= 500; }

  function log(level) {
    var args = [TAG].concat(Array.prototype.slice.call(arguments, 1));
    if (console[level]) console[level].apply(console, args);
  }

  /* ─── ContentCache ──────────────────────────────────────────────────────── */

  function Cache(wid, ttl) {
    this.m = Object.create(null); // in-memory
    this.w = wid;
    this.t = ttl;
  }

  Cache.prototype._k = function (k) { return STORE_PFX + this.w + ':' + k; };

  Cache.prototype.get = function (k) {
    var now = Date.now(), e;
    if ((e = this.m[k]) && e.x > now) return e.v;
    if (e) delete this.m[k];
    try {
      var raw = localStorage.getItem(this._k(k));
      if (raw) {
        e = JSON.parse(raw);
        if (e.x > now) { this.m[k] = e; return e.v; }
        localStorage.removeItem(this._k(k));
      }
    } catch (_) {}
    return null;
  };

  Cache.prototype.set = function (item) {
    var e = { v: item, x: Date.now() + this.t };
    this.m[item.key] = e;
    try { localStorage.setItem(this._k(item.key), JSON.stringify(e)); } catch (_) {}
  };

  Cache.prototype.misses = function (keys) {
    var self = this, out = [];
    keys.forEach(function (k) { if (!self.get(k)) out.push(k); });
    return out;
  };

  Cache.prototype.drop = function (k) {
    delete this.m[k];
    try { localStorage.removeItem(this._k(k)); } catch (_) {}
  };

  Cache.prototype.dropAll = function () {
    this.m = Object.create(null);
    try {
      var pfx = STORE_PFX + this.w + ':', out = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.slice(0, pfx.length) === pfx) out.push(key);
      }
      out.forEach(function (k) { localStorage.removeItem(k); });
    } catch (_) {}
  };

  /* ─── ContentFetcher ─────────────────────────────────────────────────────── */

  function Fetcher(cfg) {
    this.k = cfg.apiKey;
    this.w = cfg.websiteId;
    this.u = cfg.apiUrl || API_URL;
    this.p = cfg.preview || false;
    this.tags = Object.create(null); // etags by key
  }

  Fetcher.prototype.hdrs = function () {
    return { 'Content-Type': 'application/json', 'X-CMS-Key': this.k };
  };

  Fetcher.prototype.url = function (path, qs) {
    var u = new URL(path, this.u);
    u.searchParams.set('website_id', this.w);
    if (this.p) u.searchParams.set('preview', 'true');
    if (qs) Object.keys(qs).forEach(function (k) { u.searchParams.set(k, qs[k]); });
    return u.toString();
  };

  Fetcher.prototype.one = function (key) {
    var self = this;
    var url  = self.url('/public/content', { key: key });

    function go(n) {
      var hdrs = Object.assign({}, self.hdrs());
      if (self.tags[key]) hdrs['If-None-Match'] = self.tags[key];

      return fetch(url, { headers: hdrs, credentials: 'omit' })
        .then(function (res) {
          if (res.status === 304) return null;
          if (res.ok) {
            var etag = res.headers.get('ETag');
            if (etag) self.tags[key] = etag;
            return res.json();
          }
          if (retryable(res.status) && n < MAX_RETRY)
            return sleep(delay(n, res.headers.get('Retry-After'))).then(function () { return go(n + 1); });
          if (res.status === 401) throw new Error('Invalid API key');
          if (res.status === 404) return null;
          throw new Error('HTTP ' + res.status);
        })
        .catch(function (err) {
          if (n < MAX_RETRY && !/HTTP/.test(err.message))
            return sleep(delay(n, null)).then(function () { return go(n + 1); });
          throw err;
        });
    }
    return go(0);
  };

  Fetcher.prototype.batch = function (keys) {
    if (!keys || !keys.length) return Promise.resolve(new Map());
    var self   = this;
    var result = new Map();
    var chunks = [];
    for (var i = 0; i < keys.length; i += BATCH_MAX)
      chunks.push(keys.slice(i, i + BATCH_MAX));

    return Promise.all(chunks.map(function (chunk) {
      var url = self.url('/public/content/batch');
      function go(n) {
        return fetch(url, {
          method: 'POST',
          headers: self.hdrs(),
          credentials: 'omit',
          body: JSON.stringify({ website_id: self.w, keys: chunk, preview: self.p }),
        })
        .then(function (res) {
          if (res.ok) return res.json().then(function (d) {
            Object.keys(d.data || {}).forEach(function (k) { result.set(k, d.data[k]); });
          });
          if (retryable(res.status) && n < MAX_RETRY)
            return sleep(delay(n, res.headers.get('Retry-After'))).then(function () { return go(n + 1); });
          if (res.status === 401) throw new Error('Invalid API key');
          throw new Error('HTTP ' + res.status);
        })
        .catch(function (err) {
          if (n < MAX_RETRY && !/HTTP/.test(err.message))
            return sleep(delay(n, null)).then(function () { return go(n + 1); });
          throw err;
        });
      }
      return go(0);
    })).then(function () { return result; });
  };

  /* ─── DOM helpers ────────────────────────────────────────────────────────── */

  function inferMode(el, attrName) {
    if (attrName) return 'attr';
    var t = el.tagName.toLowerCase();
    if (t === 'img' || t === 'video' || t === 'audio' || t === 'iframe') return 'src';
    if (t === 'a')                                                         return 'href';
    if (t === 'input' || t === 'textarea')                                 return 'value';
    return 'auto';
  }

  function autoMode(ct) {
    if (ct === 'richtext') return 'html';
    if (ct === 'image')    return 'src';
    return 'text';
  }

  function resolveEl(el) {
    var key = (el.getAttribute(A_KEY) || '').trim();
    if (!key) return null;
    var attr = (el.getAttribute(A_ATTR) || '').trim();
    return {
      el:  el,
      key: key,
      mode: el.getAttribute(A_TYPE) || inferMode(el, attr),
      attr: attr || null,
      fb:   el.getAttribute(A_FALLBACK) || el.textContent || '',
    };
  }

  function scan(root) {
    var out = [];
    (root || document).querySelectorAll('[' + A_KEY + ']').forEach(function (el) {
      var r = resolveEl(el);
      if (r) out.push(r);
    });
    return out;
  }

  function apply(r, item) {
    var el    = r.el;
    var value = (item.value !== null && item.value !== undefined) ? item.value : r.fb;
    var mode  = r.mode === 'auto' ? autoMode(item.content_type) : r.mode;
    try {
      if      (mode === 'text')  { el.textContent = value; }
      else if (mode === 'html')  { el.innerHTML   = value; }
      else if (mode === 'src')   {
        el.setAttribute('src', value);
        if (el.tagName.toLowerCase() === 'img' && item.metadata && item.metadata.alt)
          el.setAttribute('alt', item.metadata.alt);
      }
      else if (mode === 'href')  { el.setAttribute('href',  value); }
      else if (mode === 'value') { el.value = value; }
      else if (mode === 'attr')  { el.setAttribute(r.attr || 'content', value); }
      else                       { el.textContent = value; }
      el.setAttribute('data-cms-loaded', '');
      el.removeAttribute('data-cms-loading');
    } catch (e) { log('warn', 'apply error on', el, e); }
  }

  function markLoad(list) {
    list.forEach(function (r) { r.el.setAttribute('data-cms-loading', ''); });
  }

  function fallback(r) {
    if (r.fb) r.el.textContent = r.fb;
    r.el.setAttribute('data-cms-error', '');
    r.el.removeAttribute('data-cms-loading');
  }

  function watch(root, cb) {
    if (typeof MutationObserver === 'undefined') return function () {};
    var obs = new MutationObserver(function (muts) {
      var found = [];
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          var r = resolveEl(n);
          if (r) found.push(r);
          found = found.concat(scan(n));
        });
      });
      if (found.length) cb(found);
    });
    obs.observe(root || document, { childList: true, subtree: true });
    return function () { obs.disconnect(); };
  }

  function uniq(list) {
    var seen = Object.create(null), out = [];
    list.forEach(function (r) { if (!seen[r.key]) { seen[r.key] = 1; out.push(r.key); } });
    return out;
  }

  function scriptCfg() {
    var scripts = document.querySelectorAll('script[data-key], script[src*="reactcms"]');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i], k = s.getAttribute('data-key');
      if (!k) continue;
      return {
        apiKey:       k,
        websiteId:    s.getAttribute('data-website'),
        apiUrl:       s.getAttribute('data-api-url'),
        preview:      s.getAttribute('data-preview') === 'true',
        autoDiscover: s.getAttribute('data-auto-discover') === 'true',
        cacheTtl:     s.getAttribute('data-cache-ttl') ? +s.getAttribute('data-cache-ttl') : null,
      };
    }
    return {};
  }

  /* ─── Auto-discover ──────────────────────────────────────────────────────── */

  var DISCOVER_TAGS = {
    h1:1,h2:1,h3:1,h4:1,h5:1,h6:1,p:1,span:1,a:1,button:1,label:1,
    li:1,td:1,th:1,blockquote:1,figcaption:1,caption:1,legend:1,
    dt:1,dd:1,summary:1,small:1,strong:1,em:1,b:1,i:1,u:1
  };
  var SKIP_ANCESTORS = { script:1, style:1, noscript:1, svg:1, head:1, template:1 };
  var INLINE_TAGS = { strong:1,em:1,b:1,i:1,u:1,a:1,span:1,br:1,small:1,mark:1,sub:1,sup:1,code:1 };
  var MIN_TEXT = 2;
  var MAX_KEY_LEN = 60;

  function insideSkipped(el) {
    var p = el.parentElement;
    while (p) {
      if (SKIP_ANCESTORS[p.tagName.toLowerCase()]) return true;
      p = p.parentElement;
    }
    return false;
  }

  function slugify(text, maxLen) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, maxLen);
  }

  function hasInlineMarkup(el) {
    var ch = el.children;
    for (var j = 0; j < ch.length; j++) {
      if (INLINE_TAGS[ch[j].tagName.toLowerCase()]) return true;
    }
    return false;
  }

  function hasChildTextTag(el) {
    var tags = Object.keys(DISCOVER_TAGS).join(',');
    var children = el.querySelectorAll(tags);
    for (var j = 0; j < children.length; j++) {
      var c = children[j];
      if (c === el || c.hasAttribute(A_KEY)) continue;
      if ((c.textContent || '').trim().length >= MIN_TEXT) return true;
    }
    return false;
  }

  function discoverElements(root) {
    var all = (root || document).querySelectorAll('*');
    var found = [];
    var usedKeys = Object.create(null);

    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var tag = el.tagName.toLowerCase();

      if (el.hasAttribute(A_KEY)) continue;
      if (!DISCOVER_TAGS[tag]) continue;
      if (insideSkipped(el)) continue;

      var fullText = (el.textContent || '').trim();
      if (fullText.length < MIN_TEXT) continue;
      if (hasChildTextTag(el)) continue;

      var hasMk = hasInlineMarkup(el);
      var value = hasMk ? el.innerHTML.trim() : fullText;
      if (value.length < MIN_TEXT) continue;

      var slug = slugify(fullText, MAX_KEY_LEN - tag.length - 5);
      var key = slug.length >= 3 ? (tag + '-' + slug) : (tag + '-' + i);

      if (usedKeys[key]) {
        var suf = 2;
        while (usedKeys[key + '-' + suf]) suf++;
        key = key + '-' + suf;
      }
      usedKeys[key] = 1;

      found.push({
        el: el,
        key: key,
        value: value,
        tag: tag,
        content_type: hasMk ? 'richtext' : 'text'
      });
    }

    return found;
  }

  Fetcher.prototype.discover = function (items) {
    if (!items || !items.length) return Promise.resolve({ created: [], existing: [] });
    var self = this;
    var url = self.url('/public/content/discover');

    return fetch(url, {
      method: 'POST',
      headers: self.hdrs(),
      credentials: 'omit',
      body: JSON.stringify({ website_id: self.w, items: items }),
    }).then(function (res) {
      if (res.ok) return res.json();
      if (res.status === 401) throw new Error('Invalid API key');
      if (res.status === 403) throw new Error('Auto-discover requires a write-scoped API key (cms_sk_...)');
      throw new Error('Discover failed: HTTP ' + res.status);
    });
  };

  /* ─── ReactCMS ───────────────────────────────────────────────────────────── */

  /**
   * @constructor
   * @param {Object}   cfg
   * @param {string}   cfg.apiKey    - Your API key (cms_pk_... or cms_sk_...)
   * @param {string}   cfg.websiteId - Your website UUID
   * @param {string}   [cfg.apiUrl]  - Override the API base URL
   * @param {boolean}  [cfg.preview] - Preview / draft mode (requires write key)
   * @param {number}   [cfg.cacheTtl]- In-memory + localStorage TTL in ms (default 60000)
   * @param {Function} [cfg.onLoad]  - Callback(key, value, el) on each resolved item
   * @param {Function} [cfg.onError] - Callback(key, Error, el|null) on failures
   */
  function ReactCMS(cfg) {
    if (!cfg)           throw new Error(TAG + ' config is required');
    if (!cfg.apiKey)    throw new Error(TAG + ' apiKey is required');
    if (!cfg.websiteId) throw new Error(TAG + ' websiteId is required');

    this._c = {
      apiKey:    cfg.apiKey,
      websiteId: cfg.websiteId,
      apiUrl:    cfg.apiUrl   || API_URL,
      preview:   cfg.preview  || false,
      cacheTtl:  cfg.cacheTtl || CACHE_TTL,
      onLoad:    cfg.onLoad   || function () {},
      onError:   cfg.onError  || function () {},
    };

    this._cache  = new Cache(this._c.websiteId, this._c.cacheTtl);
    this._fetch  = new Fetcher(this._c);
    this._stop   = null;

    log('info', 'v' + V + ' ready · website:', this._c.websiteId);
  }

  /**
   * Scan the DOM for [data-cms] elements and load content into them.
   * Returns a Promise that resolves when all content has been applied.
   *
   * @param {Element|Document} [root] - Scope of the scan (default: document)
   * @returns {Promise<void>}
   */
  ReactCMS.prototype.load = function (root) {
    var found = scan(root);
    return found.length ? this._run(found) : Promise.resolve();
  };

  /**
   * Fetch a single key by name and optionally apply it to an element.
   *
   * @param {string}  key  - The data-cms key to fetch
   * @param {Element} [el] - Element to apply the content to
   * @returns {Promise<Object|null>}
   */
  ReactCMS.prototype.loadKey = function (key, el) {
    var self = this;
    var hit  = self._cache.get(key);
    if (hit) {
      if (el) { apply(resolveEl(el) || { el: el, key: key, mode: 'auto', attr: null, fb: '' }, hit); self._c.onLoad(key, hit.value, el); }
      return Promise.resolve(hit);
    }
    return self._fetch.one(key)
      .then(function (item) {
        if (!item) return null;
        self._cache.set(item);
        if (el) { apply(resolveEl(el) || { el: el, key: key, mode: 'auto', attr: null, fb: '' }, item); self._c.onLoad(key, item.value, el); }
        return item;
      })
      .catch(function (err) { self._c.onError(key, err, el || null); return null; });
  };

  /**
   * Start watching the DOM for dynamically added [data-cms] elements.
   * Automatically fetches and populates them as they appear.
   *
   * @param {Element|Document} [root]
   */
  ReactCMS.prototype.observe = function (root) {
    if (this._stop) return;
    var self = this;
    this._stop = watch(root || document, function (els) { self._run(els); });
  };

  /** Stop the MutationObserver. */
  ReactCMS.prototype.stopObserving = function () {
    if (this._stop) { this._stop(); this._stop = null; }
  };

  /**
   * Invalidate a specific key from both the in-memory and localStorage cache.
   * @param {string} key
   */
  ReactCMS.prototype.invalidate    = function (k) { this._cache.drop(k);    };

  /** Invalidate all cached content for this website. */
  ReactCMS.prototype.invalidateAll = function ()  { this._cache.dropAll();  };

  /**
   * Auto-discover all text-bearing elements on the page, register them in the CMS,
   * and inject data-cms attributes so they become managed.
   * Requires a write-scoped API key (cms_sk_...).
   *
   * @param {Element|Document} [root]
   * @returns {Promise<{created:string[], existing:string[], total:number}>}
   */
  ReactCMS.prototype.discover = function (root, _retries) {
    var self = this;
    var maxRetries = 5;
    var attempt = _retries || 0;
    var found = discoverElements(root);
    if (!found.length) {
      if (attempt < maxRetries) {
        var delayMs = (attempt + 1) * 1000;
        log('info', 'Auto-discover found no elements — retrying in ' + delayMs + 'ms (attempt ' + (attempt + 1) + '/' + maxRetries + ')');
        return new Promise(function (resolve) { setTimeout(resolve, delayMs); })
          .then(function () { return self.discover(root, attempt + 1); });
      }
      log('info', 'Auto-discover found no text elements after ' + maxRetries + ' retries');
      return Promise.resolve({ created: [], existing: [], total: 0 });
    }

    log('info', 'Auto-discover found ' + found.length + ' text elements');

    var items = found.map(function (d) {
      return { key: d.key, value: d.value, content_type: d.content_type };
    });

    return self._fetch.discover(items)
      .then(function (result) {
        // Inject data-cms attributes so the elements become managed
        found.forEach(function (d) {
          d.el.setAttribute(A_KEY, d.key);
        });
        log('info', 'Auto-discover registered ' + result.created.length + ' new keys, '
          + result.existing.length + ' already existed');
        return { created: result.created, existing: result.existing, total: found.length };
      })
      .catch(function (err) {
        log('error', 'Auto-discover failed', err);
        throw err;
      });
  };

  /* Internal: resolve elements, split cache hits/misses, fetch misses */
  ReactCMS.prototype._run = function (list) {
    var self = this;
    var map  = Object.create(null); // key -> [r]
    list.forEach(function (r) { (map[r.key] || (map[r.key] = [])).push(r); });

    var all   = uniq(list);
    var misses = [];

    all.forEach(function (k) {
      var hit = self._cache.get(k);
      if (hit) {
        map[k].forEach(function (r) { apply(r, hit); self._c.onLoad(k, hit.value, r.el); });
      } else {
        misses.push(k);
        markLoad(map[k]);
      }
    });

    if (!misses.length) return Promise.resolve();

    return self._fetch.batch(misses)
      .then(function (fetched) {
        fetched.forEach(function (item, k) {
          self._cache.set(item);
          (map[k] || []).forEach(function (r) { apply(r, item); self._c.onLoad(k, item.value, r.el); });
        });
        misses.forEach(function (k) {
          if (!fetched.has(k)) {
            (map[k] || []).forEach(function (r) {
              fallback(r);
              self._c.onError(k, new Error('Key "' + k + '" not found or unpublished'), r.el);
            });
          }
        });
      })
      .catch(function (err) {
        misses.forEach(function (k) {
          (map[k] || []).forEach(function (r) { fallback(r); self._c.onError(k, err, r.el); });
        });
      });
  };

  /* ─── Auto-init ──────────────────────────────────────────────────────────── */

  (function autoInit() {
    var cfg = scriptCfg();
    if (!cfg.apiKey) return;
    if (!cfg.websiteId) { log('warn', 'data-website missing on <script> — add data-website="your-uuid"'); return; }

    var cms = new ReactCMS({
      apiKey:    cfg.apiKey,
      websiteId: cfg.websiteId,
      apiUrl:    cfg.apiUrl   || undefined,
      preview:   cfg.preview  || false,
      cacheTtl:  cfg.cacheTtl || undefined,
    });

    if (typeof window !== 'undefined') window.ReactCMS = cms;

    function run() {
      var p = cfg.autoDiscover
        ? cms.discover().then(function () { return cms.load(); })
        : cms.load();
      p.then(function () { cms.observe(); })
       .then(function () {
         if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
           window.parent.postMessage({ type: 'pagepilot:ready' }, '*');
         }
       })
       .catch(function (e) { log('error', 'init failed', e); });
    }

    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', run, { once: true })
      : run();
  })();

  /* ─── PagePilot V2 — inline edit mode ────────────────────────────────────── */

  var PagePilot = {
    _active: false,
    _editing: null,   // currently editing element
    _toolbar: null,
    _styleEl: null,
    _handlers: [],     // stored for cleanup
    _undoStack: [],    // { key, value } entries for undo
    _redoStack: [],    // { key, value } entries for redo

    activate: function () {
      if (this._active) return;
      this._active = true;
      this._injectStyles();

      var self = this;
      var editableCount = 0;
      var usedKeys = {};
      var TEXT_TAGS = 'h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,td,th,blockquote,figcaption,small,strong,em,b,i,u,legend,dt,dd,summary,caption';
      var SKIP = { script:1, style:1, noscript:1, svg:1, head:1, template:1, nav:1 };

      // Phase 1: elements with data-cms (have known keys)
      var tagged = document.querySelectorAll('[' + A_KEY + ']');
      for (var i = 0; i < tagged.length; i++) {
        var el = tagged[i];
        if (!self._isEditable(el)) continue;
        usedKeys[el.getAttribute(A_KEY)] = 1;
        editableCount++;
        self._attachHandlers(el);
      }

      // Phase 2: all text-bearing elements without data-cms
      var all = document.querySelectorAll(TEXT_TAGS);
      for (var j = 0; j < all.length; j++) {
        var tel = all[j];
        if (tel.hasAttribute(A_KEY)) continue;
        if (!self._isEditable(tel)) continue;

        // Skip if inside a skipped ancestor
        var skip = false;
        var p = tel.parentElement;
        while (p) { if (SKIP[p.tagName.toLowerCase()]) { skip = true; break; } p = p.parentElement; }
        if (skip) continue;

        var text = (tel.textContent || '').trim();
        if (text.length < 2) continue;

        // Skip if a child text element also qualifies (prefer leaf nodes)
        if (tel.querySelector(TEXT_TAGS) && tel.querySelector(TEXT_TAGS).textContent.trim().length >= 2) continue;

        // Auto-generate a key
        var tag = tel.tagName.toLowerCase();
        var slug = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50);
        var key = slug.length >= 3 ? (tag + '-' + slug) : (tag + '-auto-' + j);
        if (usedKeys[key]) { var s = 2; while (usedKeys[key + '-' + s]) s++; key = key + '-' + s; }
        usedKeys[key] = 1;

        tel.setAttribute(A_KEY, key);
        editableCount++;
        self._attachHandlers(tel);
      }

      if (window.parent !== window) {
        window.parent.postMessage({ type: 'pagepilot:elements', count: editableCount }, '*');
      }
      log('info', 'PagePilot activated — ' + editableCount + ' editable elements');
    },

    deactivate: function () {
      if (!this._active) return;
      if (this._editing) this._cancelEdit();
      for (var i = 0; i < this._handlers.length; i++) {
        var h = this._handlers[i];
        h.el.removeEventListener('mouseenter', h.enter);
        h.el.removeEventListener('mouseleave', h.leave);
        h.el.removeEventListener('click', h.click);
        h.el.classList.remove('pp-hover', 'pp-editing', 'pp-saved');
      }
      this._handlers = [];
      if (this._toolbar && this._toolbar.parentNode) this._toolbar.parentNode.removeChild(this._toolbar);
      this._toolbar = null;
      if (this._styleEl && this._styleEl.parentNode) this._styleEl.parentNode.removeChild(this._styleEl);
      this._styleEl = null;
      this._active = false;
      log('info', 'PagePilot deactivated');
    },

    _isEditable: function (el) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'img') return true;
      if (tag === 'video' || tag === 'audio' || tag === 'iframe') return false;
      var mode = el.getAttribute(A_TYPE);
      if (mode === 'href' || mode === 'attr' || mode === 'value') return false;
      return true;
    },

    _isImage: function (el) {
      return el.tagName.toLowerCase() === 'img' || el.getAttribute(A_TYPE) === 'src';
    },

    _isRichtext: function (el) {
      var mode = el.getAttribute(A_TYPE);
      if (mode === 'html') return true;
      var children = el.children;
      for (var i = 0; i < children.length; i++) {
        var t = children[i].tagName.toLowerCase();
        if (t === 'strong' || t === 'em' || t === 'a' || t === 'b' || t === 'i' || t === 'u' || t === 'br' || t === 'span') return true;
      }
      return false;
    },

    _attachHandlers: function (el) {
      var self = this;
      function enter() { if (self._editing !== el) el.classList.add('pp-hover'); }
      function leave() { el.classList.remove('pp-hover'); }
      function click(e) {
        e.preventDefault();
        e.stopPropagation();
        self._startEdit(el);
      }
      el.addEventListener('mouseenter', enter);
      el.addEventListener('mouseleave', leave);
      el.addEventListener('click', click);
      this._handlers.push({ el: el, enter: enter, leave: leave, click: click });
    },

    _startEdit: function (el) {
      if (this._editing) this._cancelEdit();

      if (this._isImage(el)) {
        el._ppOriginal = el.getAttribute('src') || '';
        el._ppRich = false;
        el._ppImage = true;
        el.classList.remove('pp-hover');
        el.classList.add('pp-editing');
        this._editing = el;
        this._showImageToolbar(el);
        return;
      }

      var isRich = this._isRichtext(el);
      el._ppOriginal = isRich ? el.innerHTML : el.textContent;
      el._ppRich = isRich;
      el._ppImage = false;
      el.classList.remove('pp-hover');
      el.classList.add('pp-editing');
      el.contentEditable = 'true';
      el.focus();
      this._editing = el;
      this._showToolbar(el);
    },

    _saveEdit: function (overrideValue) {
      var el = this._editing;
      if (!el) return;
      var key = el.getAttribute(A_KEY);
      var newVal;
      var contentType;

      if (el._ppImage) {
        newVal = overrideValue || el.getAttribute('src') || '';
        contentType = 'image';
        if (overrideValue) el.setAttribute('src', overrideValue);
      } else {
        newVal = el._ppRich ? el.innerHTML : el.textContent;
        contentType = el._ppRich ? 'richtext' : 'text';
        el.contentEditable = 'false';
      }

      el.classList.remove('pp-editing');
      el.classList.add('pp-saved');
      setTimeout(function () { el.classList.remove('pp-saved'); }, 800);
      this._hideToolbar();
      this._editing = null;

      if (newVal !== el._ppOriginal) {
        this._undoStack.push({ el: el, key: key, oldVal: el._ppOriginal, newVal: newVal, rich: el._ppRich, image: el._ppImage });
        this._redoStack = [];
        if (window.parent !== window) {
          window.parent.postMessage({
            type: 'pagepilot:change',
            key: key,
            value: newVal,
            content_type: contentType,
            original: el._ppOriginal
          }, '*');
        }
      }
    },

    undo: function () {
      if (this._undoStack.length === 0) return;
      var entry = this._undoStack.pop();
      this._redoStack.push(entry);
      if (entry.image) { entry.el.setAttribute('src', entry.oldVal); }
      else if (entry.rich) { entry.el.innerHTML = entry.oldVal; }
      else { entry.el.textContent = entry.oldVal; }
      entry.el.classList.add('pp-saved');
      setTimeout(function () { entry.el.classList.remove('pp-saved'); }, 600);
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'pagepilot:change', key: entry.key, value: entry.oldVal, content_type: entry.image ? 'image' : entry.rich ? 'richtext' : 'text', original: entry.newVal }, '*');
      }
    },

    redo: function () {
      if (this._redoStack.length === 0) return;
      var entry = this._redoStack.pop();
      this._undoStack.push(entry);
      if (entry.image) { entry.el.setAttribute('src', entry.newVal); }
      else if (entry.rich) { entry.el.innerHTML = entry.newVal; }
      else { entry.el.textContent = entry.newVal; }
      entry.el.classList.add('pp-saved');
      setTimeout(function () { entry.el.classList.remove('pp-saved'); }, 600);
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'pagepilot:change', key: entry.key, value: entry.newVal, content_type: entry.image ? 'image' : entry.rich ? 'richtext' : 'text', original: entry.oldVal }, '*');
      }
    },

    _cancelEdit: function () {
      var el = this._editing;
      if (!el) return;
      if (el._ppImage) {
        el.setAttribute('src', el._ppOriginal);
      } else if (el._ppRich) {
        el.innerHTML = el._ppOriginal;
        el.contentEditable = 'false';
      } else {
        el.textContent = el._ppOriginal;
        el.contentEditable = 'false';
      }
      el.classList.remove('pp-editing');
      this._hideToolbar();
      this._editing = null;
    },

    _showToolbar: function (el) {
      if (this._toolbar) this._hideToolbar();

      var key = el.getAttribute(A_KEY) || '';
      var bar = document.createElement('div');
      bar.id = 'pp-toolbar';
      bar.innerHTML =
        '<span id="pp-key" style="font-size:10px;font-family:monospace;color:#22c55e;background:rgba(34,197,94,0.1);padding:3px 8px;border-radius:5px;border:1px solid rgba(34,197,94,0.25);margin-right:8px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + key + '</span>' +
        '<button id="pp-save" style="background:#22c55e;color:#0b1220;border:none;padding:5px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;letter-spacing:0.02em;">Save</button>' +
        '<button id="pp-cancel" style="background:rgba(255,255,255,0.06);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);padding:5px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;margin-left:6px;font-family:system-ui,sans-serif;">Cancel</button>';
      document.body.appendChild(bar);
      this._toolbar = bar;

      var self = this;
      document.getElementById('pp-save').addEventListener('click', function (e) { e.stopPropagation(); self._saveEdit(); });
      document.getElementById('pp-cancel').addEventListener('click', function (e) { e.stopPropagation(); self._cancelEdit(); });

      this._positionToolbar(el);
      var reposition = function () { if (self._editing === el) self._positionToolbar(el); };
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      bar._cleanup = function () {
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
      };
    },

    _showImageToolbar: function (el) {
      if (this._toolbar) this._hideToolbar();

      var key = el.getAttribute(A_KEY) || '';
      var currentSrc = el.getAttribute('src') || '';
      var bar = document.createElement('div');
      bar.id = 'pp-toolbar';
      bar.innerHTML =
        '<span style="font-size:10px;font-family:monospace;color:#22c55e;background:rgba(34,197,94,0.1);padding:3px 8px;border-radius:5px;border:1px solid rgba(34,197,94,0.25);margin-right:8px;white-space:nowrap;">' + key + '</span>' +
        '<input id="pp-img-url" type="url" value="' + currentSrc.replace(/"/g, '&quot;') + '" placeholder="Image URL" style="flex:1;min-width:180px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:5px 10px;font-size:12px;color:#e2e8f0;font-family:system-ui,sans-serif;outline:none;" />' +
        '<button id="pp-save" style="background:#22c55e;color:#0b1220;border:none;padding:5px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;margin-left:6px;">Save</button>' +
        '<button id="pp-cancel" style="background:rgba(255,255,255,0.06);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);padding:5px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;margin-left:6px;font-family:system-ui,sans-serif;">Cancel</button>';
      document.body.appendChild(bar);
      this._toolbar = bar;

      var self = this;
      document.getElementById('pp-save').addEventListener('click', function (e) {
        e.stopPropagation();
        var url = document.getElementById('pp-img-url').value;
        self._saveEdit(url);
      });
      document.getElementById('pp-cancel').addEventListener('click', function (e) { e.stopPropagation(); self._cancelEdit(); });
      document.getElementById('pp-img-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('pp-save').click(); } });
      document.getElementById('pp-img-url').focus();

      this._positionToolbar(el);
      var reposition = function () { if (self._editing === el) self._positionToolbar(el); };
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      bar._cleanup = function () {
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
      };
    },

    _positionToolbar: function (el) {
      var bar = this._toolbar;
      if (!bar) return;
      var rect = el.getBoundingClientRect();
      bar.style.position = 'fixed';
      bar.style.top = Math.max(8, rect.top - 42) + 'px';
      bar.style.left = rect.left + 'px';
      bar.style.zIndex = '2147483647';
    },

    _hideToolbar: function () {
      var bar = this._toolbar;
      if (!bar) return;
      if (bar._cleanup) bar._cleanup();
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      this._toolbar = null;
    },

    _injectStyles: function () {
      if (this._styleEl) return;
      var s = document.createElement('style');
      s.id = 'pp-styles';
      s.textContent =
        '[data-cms] { cursor: pointer !important; transition: outline 0.15s ease, box-shadow 0.15s ease; }' +
        '[data-cms].pp-hover { outline: 2px dashed #22c55e; outline-offset: 3px; position:relative; }' +
        '[data-cms].pp-hover::after { content:attr(data-cms); position:absolute; top:-20px; left:0; font-size:9px; font-family:monospace; color:#22c55e; background:#0b1220; padding:1px 6px; border-radius:3px; border:1px solid rgba(34,197,94,0.3); pointer-events:none; white-space:nowrap; z-index:2147483646; }' +
        '[data-cms].pp-editing { outline: 2px solid #22c55e; outline-offset: 3px; box-shadow: 0 0 0 4px rgba(34,197,94,0.15); cursor: text !important; }' +
        '[data-cms].pp-editing::after { display:none; }' +
        '[data-cms].pp-saved { animation: pp-flash 0.8s ease; }' +
        '@keyframes pp-flash { 0%{background:rgba(34,197,94,0.2)} 100%{background:transparent} }' +
        '#pp-toolbar { display:flex; align-items:center; padding:6px 8px; background:#0b1220; border:1px solid #1e293b; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.6); }' +
        '#pp-toolbar button:hover { filter:brightness(1.1); }';
      document.head.appendChild(s);
      this._styleEl = s;
    }
  };

  /* ─── PagePilot message listener ────────────────────────────────────────── */

  if (typeof window !== 'undefined') {
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (!data || typeof data.type !== 'string') return;
      if (data.type === 'pagepilot:init') PagePilot.activate();
      if (data.type === 'pagepilot:deactivate') PagePilot.deactivate();
    });

    // Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo (only when edit mode active)
    window.addEventListener('keydown', function (e) {
      if (!PagePilot._active || PagePilot._editing) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); PagePilot.undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) { e.preventDefault(); PagePilot.redo(); }
    });
  }

  return ReactCMS;
});
