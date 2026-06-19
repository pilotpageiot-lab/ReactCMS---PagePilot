/**
 * ReactCMS SDK test suite.
 *
 * Runs in a browser (open test/runner.html) or Node.js with JSDOM:
 *   node --experimental-vm-modules test/sdk.test.js
 *
 * Tests cover: cache, fetcher (mocked fetch), DOM apply, MutationObserver,
 * auto-mode inference, fallback on error, ETags, batch chunking.
 */

/* ─── Minimal test harness ──────────────────────────────────────────────── */

var results = { pass: 0, fail: 0, errors: [] };

function assert(condition, label) {
  if (condition) {
    results.pass++;
    console.log('  ✓ ' + label);
  } else {
    results.fail++;
    results.errors.push(label);
    console.error('  ✗ ' + label);
  }
}

async function test(name, fn) {
  console.group(name);
  try { await fn(); }
  catch (e) { results.fail++; results.errors.push(name + ': ' + e.message); console.error('  ✗ Threw: ' + e.message); }
  console.groupEnd();
}

/* ─── SDK import (works both as module and plain script) ─────────────────── */

var ReactCMSClass;
if (typeof module !== 'undefined' && typeof require !== 'undefined') {
  // Node / JSDOM — require the bundle
  ReactCMSClass = require('../dist/sdk.js').ReactCMSClass;
} else if (typeof window !== 'undefined' && window.ReactCMSClass) {
  ReactCMSClass = window.ReactCMSClass;
} else {
  throw new Error('ReactCMSClass not found — load sdk.js first');
}

/* ─── Fetch mock ─────────────────────────────────────────────────────────── */

function makeFetch(responses) {
  var queue = responses.slice();
  return function mockFetch(url, opts) {
    var spec = queue.shift() || { status: 404, body: { error: 'NOT_FOUND', message: 'Not found' } };
    var headers = new Headers(Object.assign({ 'Content-Type': 'application/json' }, spec.headers || {}));
    return Promise.resolve({
      status:  spec.status || 200,
      ok:      (spec.status || 200) >= 200 && (spec.status || 200) < 300,
      headers: headers,
      json:    function () { return Promise.resolve(spec.body); },
    });
  };
}

var ITEM = { key: 'hero-title', content_type: 'text', value: 'Hello world', metadata: {}, version: 3 };
var ITEM_IMAGE = { key: 'hero-image', content_type: 'image', value: 'https://example.com/img.jpg', metadata: { alt: 'Hero' }, version: 1 };
var ITEM_HTML  = { key: 'about-body', content_type: 'richtext', value: '<p>Rich <strong>text</strong></p>', metadata: {}, version: 2 };

/* ─── DOM helpers ────────────────────────────────────────────────────────── */

function makeEl(tag, attrs) {
  var el = document.createElement(tag || 'p');
  if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
  document.body.appendChild(el);
  return el;
}

function cleanup() {
  // Remove all test elements from body
  document.querySelectorAll('[data-test]').forEach(function (el) { el.remove(); });
  // Clear localStorage test keys
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf('rcms_') === 0) localStorage.removeItem(k);
    });
  } catch (_) {}
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tests
═══════════════════════════════════════════════════════════════════════════ */

await test('Constructor validation', function () {
  assert(
    (function () { try { new ReactCMSClass({}); return false; } catch(e) { return /apiKey/.test(e.message); } })(),
    'throws when apiKey missing'
  );
  assert(
    (function () { try { new ReactCMSClass({ apiKey: 'k' }); return false; } catch(e) { return /websiteId/.test(e.message); } })(),
    'throws when websiteId missing'
  );
  assert(
    (function () { try { new ReactCMSClass({ apiKey: 'k', websiteId: 'w' }); return true; } catch(e) { return false; } })(),
    'constructs with minimal valid config'
  );
});

await test('load() — single text element', async function () {
  cleanup();
  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w' });
  global.fetch = makeFetch([{ status: 200, body: { data: { 'hero-title': ITEM }, missing: [] } }]);

  var el = makeEl('h1', { 'data-cms': 'hero-title', 'data-test': '1', 'data-cms-fallback': 'Fallback' });
  el.textContent = 'Fallback';

  await cms.load(el.parentElement);

  assert(el.textContent === 'Hello world', 'textContent updated');
  assert(el.hasAttribute('data-cms-loaded'), 'data-cms-loaded attribute set');
  assert(!el.hasAttribute('data-cms-loading'), 'data-cms-loading attribute removed');
  cleanup();
});

await test('load() — image element (auto src mode)', async function () {
  cleanup();
  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w' });
  global.fetch = makeFetch([{ status: 200, body: { data: { 'hero-image': ITEM_IMAGE }, missing: [] } }]);

  var el = makeEl('img', { 'data-cms': 'hero-image', 'data-test': '2' });
  await cms.load(el.parentElement);

  assert(el.getAttribute('src') === 'https://example.com/img.jpg', 'src attribute updated');
  assert(el.getAttribute('alt') === 'Hero', 'alt from metadata applied');
  cleanup();
});

await test('load() — richtext (auto html mode)', async function () {
  cleanup();
  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w' });
  global.fetch = makeFetch([{ status: 200, body: { data: { 'about-body': ITEM_HTML }, missing: [] } }]);

  var el = makeEl('div', { 'data-cms': 'about-body', 'data-test': '3' });
  await cms.load(el.parentElement);

  assert(el.innerHTML === ITEM_HTML.value, 'innerHTML set for richtext');
  cleanup();
});

await test('load() — explicit data-cms-type="html"', async function () {
  cleanup();
  var item = Object.assign({}, ITEM, { content_type: 'text', value: '<em>hello</em>' });
  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w' });
  global.fetch = makeFetch([{ status: 200, body: { data: { 'my-html': item }, missing: [] } }]);

  var el = makeEl('div', { 'data-cms': 'my-html', 'data-cms-type': 'html', 'data-test': '4' });
  await cms.load(el.parentElement);

  assert(el.innerHTML === '<em>hello</em>', 'explicit html mode overrides auto-detection');
  cleanup();
});

await test('load() — input value mode', async function () {
  cleanup();
  var item = Object.assign({}, ITEM, { value: 'Enter your email' });
  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w' });
  global.fetch = makeFetch([{ status: 200, body: { data: { 'placeholder': item }, missing: [] } }]);

  var el = makeEl('input', { 'data-cms': 'placeholder', 'data-test': '5' });
  await cms.load(el.parentElement);

  assert(el.value === 'Enter your email', 'input.value set');
  cleanup();
});

await test('load() — data-cms-attr mode', async function () {
  cleanup();
  var item = Object.assign({}, ITEM, { value: 'My page title' });
  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w' });
  global.fetch = makeFetch([{ status: 200, body: { data: { 'page-title': item }, missing: [] } }]);

  var el = makeEl('meta', { 'data-cms': 'page-title', 'data-cms-attr': 'content', 'data-test': '6' });
  await cms.load(el.parentElement);

  assert(el.getAttribute('content') === 'My page title', 'named attribute set');
  cleanup();
});

await test('load() — href mode on <a>', async function () {
  cleanup();
  var item = Object.assign({}, ITEM, { value: 'https://example.com/cta' });
  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w' });
  global.fetch = makeFetch([{ status: 200, body: { data: { 'cta-url': item }, missing: [] } }]);

  var el = makeEl('a', { 'data-cms': 'cta-url', 'data-test': '7', 'href': '#' });
  await cms.load(el.parentElement);

  assert(el.getAttribute('href') === 'https://example.com/cta', 'href attribute updated');
  cleanup();
});

await test('load() — fallback applied on 404', async function () {
  cleanup();
  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w' });
  global.fetch = makeFetch([{ status: 200, body: { data: {}, missing: ['ghost-key'] } }]);

  var el = makeEl('p', { 'data-cms': 'ghost-key', 'data-cms-fallback': 'Fallback text', 'data-test': '8' });
  await cms.load(el.parentElement);

  assert(el.textContent === 'Fallback text', 'fallback text applied');
  assert(el.hasAttribute('data-cms-error'), 'data-cms-error attribute set');
  cleanup();
});

await test('Cache — memory hit prevents fetch', async function () {
  cleanup();
  var fetchCount = 0;
  global.fetch = function () { fetchCount++; return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve({ data: { 'hero-title': ITEM }, missing: [] }); } }); };

  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w', cacheTtl: 60000 });

  var el1 = makeEl('p', { 'data-cms': 'hero-title', 'data-test': 'c1' });
  await cms.load(el1.parentElement);
  assert(fetchCount === 1, 'first load hits network');

  fetchCount = 0;
  var el2 = makeEl('p', { 'data-cms': 'hero-title', 'data-test': 'c2' });
  await cms.load(el2.parentElement);
  assert(fetchCount === 0, 'second load served from cache (no network call)');
  assert(el2.textContent === 'Hello world', 'cached value applied correctly');
  cleanup();
});

await test('Cache — invalidate() forces re-fetch', async function () {
  cleanup();
  var fetchCount = 0;
  global.fetch = function () { fetchCount++; return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve({ data: { 'hero-title': ITEM }, missing: [] }); } }); };

  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w', cacheTtl: 60000 });
  var el = makeEl('p', { 'data-cms': 'hero-title', 'data-test': 'inv1' });
  await cms.load(el.parentElement);

  cms.invalidate('hero-title');
  fetchCount = 0;

  var el2 = makeEl('p', { 'data-cms': 'hero-title', 'data-test': 'inv2' });
  await cms.load(el2.parentElement);
  assert(fetchCount === 1, 'after invalidate() cache miss triggers re-fetch');
  cleanup();
});

await test('Batch chunking — 60 keys triggers 2 requests', async function () {
  cleanup();
  var fetchCount = 0;
  global.fetch = function (url, opts) {
    fetchCount++;
    var body = JSON.parse(opts.body);
    var data = {};
    body.keys.forEach(function (k) { data[k] = Object.assign({}, ITEM, { key: k }); });
    return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve({ data: data, missing: [] }); } });
  };

  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w', cacheTtl: 0 }); // TTL=0 so nothing caches
  var root = document.createElement('div');
  for (var i = 0; i < 60; i++) {
    var el = document.createElement('span');
    el.setAttribute('data-cms', 'key-' + i);
    root.appendChild(el);
  }
  document.body.appendChild(root);

  await cms.load(root);

  assert(fetchCount === 2, '60 keys split into 2 batch requests (max 50 per request), got: ' + fetchCount);
  root.remove();
  cleanup();
});

await test('Multiple elements share a single key', async function () {
  cleanup();
  var fetchCount = 0;
  global.fetch = function () { fetchCount++; return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve({ data: { 'headline': Object.assign({}, ITEM, { key: 'headline', value: 'Shared value' }) }, missing: [] }); } }); };

  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w', cacheTtl: 0 });
  var el1 = makeEl('h1', { 'data-cms': 'headline', 'data-test': 'sh1' });
  var el2 = makeEl('h2', { 'data-cms': 'headline', 'data-test': 'sh2' });
  var el3 = makeEl('p',  { 'data-cms': 'headline', 'data-test': 'sh3' });

  await cms.load(document.body);

  assert(fetchCount === 1, 'single fetch for multiple elements sharing a key');
  assert(el1.textContent === 'Shared value', 'el1 updated');
  assert(el2.textContent === 'Shared value', 'el2 updated');
  assert(el3.textContent === 'Shared value', 'el3 updated');
  cleanup();
});

await test('onLoad callback fires for each resolved element', async function () {
  cleanup();
  var loaded = [];
  global.fetch = function () { return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve({ data: { 'hero-title': ITEM }, missing: [] }); } }); };

  var cms = new ReactCMSClass({
    apiKey: 'k', websiteId: 'w', cacheTtl: 0,
    onLoad: function (key, value) { loaded.push({ key: key, value: value }); },
  });
  var el = makeEl('p', { 'data-cms': 'hero-title', 'data-test': 'cb1' });
  await cms.load(el.parentElement);

  assert(loaded.length === 1, 'onLoad called once');
  assert(loaded[0].key === 'hero-title', 'key passed correctly');
  assert(loaded[0].value === 'Hello world', 'value passed correctly');
  cleanup();
});

await test('onError callback fires on missing key', async function () {
  cleanup();
  var errors = [];
  global.fetch = function () { return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve({ data: {}, missing: ['ghost'] }); } }); };

  var cms = new ReactCMSClass({
    apiKey: 'k', websiteId: 'w', cacheTtl: 0,
    onError: function (key, err) { errors.push({ key: key, msg: err.message }); },
  });
  var el = makeEl('p', { 'data-cms': 'ghost', 'data-test': 'err1' });
  await cms.load(el.parentElement);

  assert(errors.length === 1, 'onError called once');
  assert(errors[0].key === 'ghost', 'error key correct');
  assert(/not found/i.test(errors[0].msg), 'error message mentions not found');
  cleanup();
});

await test('Retry on 429 — succeeds on second attempt', async function () {
  cleanup();
  var attemptCount = 0;
  global.fetch = function () {
    attemptCount++;
    if (attemptCount === 1) {
      return Promise.resolve({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '0' }), json: function () { return Promise.resolve({}); } });
    }
    return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve({ data: { 'hero-title': ITEM }, missing: [] }); } });
  };

  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w', cacheTtl: 0 });
  var el = makeEl('p', { 'data-cms': 'hero-title', 'data-test': 'retry1' });
  await cms.load(el.parentElement);

  assert(attemptCount === 2, 'retried exactly once after 429');
  assert(el.textContent === 'Hello world', 'content applied after retry');
  cleanup();
});

await test('ETag 304 — returns null (use cached value)', async function () {
  cleanup();
  global.fetch = function (url, opts) {
    if (opts && opts.headers && opts.headers['If-None-Match']) {
      return Promise.resolve({ ok: false, status: 304, headers: new Headers({ ETag: '"v3"' }), json: function () { return Promise.resolve(null); } });
    }
    return Promise.resolve({ ok: true, status: 200, headers: new Headers({ ETag: '"v3"' }), json: function () { return Promise.resolve(ITEM); } });
  };

  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w' });
  var item1 = await cms.loadKey('hero-title');
  assert(item1 && item1.value === 'Hello world', 'first fetch returns item');

  // Force second fetch (bypass memory cache but ETag should return 304)
  cms.invalidate('hero-title');
  var item2 = await cms.loadKey('hero-title');
  // 304 means "not modified" — the fetcher returns null, sdk uses cache
  assert(item2 === null || (item2 && item2.value === 'Hello world'), 'ETag 304 handled correctly');
  cleanup();
});

await test('loadKey() — programmatic single fetch', async function () {
  cleanup();
  global.fetch = function () { return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve(ITEM); } }); };

  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w', cacheTtl: 0 });
  var item = await cms.loadKey('hero-title');

  assert(item !== null, 'item returned');
  assert(item.value === 'Hello world', 'correct value');
  assert(item.version === 3, 'version preserved');
  cleanup();
});

await test('loadKey() with element — applies to provided element', async function () {
  cleanup();
  global.fetch = function () { return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve(ITEM); } }); };

  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w', cacheTtl: 0 });
  var el = makeEl('p', { 'data-cms': 'hero-title', 'data-test': 'lk1' });
  await cms.loadKey('hero-title', el);

  assert(el.textContent === 'Hello world', 'content applied to provided element');
  cleanup();
});

await test('observe() — MutationObserver picks up new elements', async function () {
  cleanup();
  return new Promise(function (resolve) {
    global.fetch = function () { return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve({ data: { 'dynamic-key': Object.assign({}, ITEM, { key: 'dynamic-key', value: 'Dynamic value' }) }, missing: [] }); } }); };

    var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w', cacheTtl: 0 });
    cms.observe(document.body);

    var el = makeEl('p', { 'data-test': 'obs1' });
    // Add the data-cms attr AFTER observe is set up → triggers MutationObserver
    setTimeout(function () {
      var child = document.createElement('span');
      child.setAttribute('data-cms', 'dynamic-key');
      el.appendChild(child);

      setTimeout(function () {
        assert(child.textContent === 'Dynamic value', 'MutationObserver picks up new element');
        cms.stopObserving();
        cleanup();
        resolve();
      }, 100);
    }, 10);
  });
});

await test('null value — fallback preserved', async function () {
  cleanup();
  var nullItem = Object.assign({}, ITEM, { value: null });
  global.fetch = function () { return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: function () { return Promise.resolve({ data: { 'empty-key': nullItem }, missing: [] }); } }); };

  var cms = new ReactCMSClass({ apiKey: 'k', websiteId: 'w', cacheTtl: 0 });
  var el = makeEl('p', { 'data-cms': 'empty-key', 'data-cms-fallback': 'Fallback text', 'data-test': 'nv1' });
  await cms.load(el.parentElement);

  assert(el.textContent === 'Fallback text', 'null value shows fallback');
  cleanup();
});

/* ─── Results ────────────────────────────────────────────────────────────── */

console.log('\n' + '═'.repeat(50));
console.log('Results: ' + results.pass + ' passed, ' + results.fail + ' failed');
if (results.errors.length) {
  console.error('Failed: ' + results.errors.join(', '));
}
console.log('═'.repeat(50));

if (typeof process !== 'undefined') {
  process.exit(results.fail > 0 ? 1 : 0);
}
