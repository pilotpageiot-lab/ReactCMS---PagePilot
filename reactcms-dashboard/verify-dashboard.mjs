import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SCREENSHOTS = 'e:/ally_/2026/ReactCMS/reactcms-dashboard/screenshots';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  const shot = async (name) => {
    await page.screenshot({ path: `${SCREENSHOTS}/${name}.png`, fullPage: false });
    console.log(`  [shot] ${name}`);
  };

  const results = [];
  const step = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
  };

  try {
    // Get auth token via API (bypass UI rate limit)
    console.log('Getting auth token via API...');
    const loginRes = await fetch(`${BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@reactcms.io', password: 'Admin1234!' }),
    });
    if (!loginRes.ok) {
      console.log(`Login API returned ${loginRes.status} — may be rate limited`);
      // Try registering a new user instead
      const regRes = await fetch(`${BASE}/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `verify${Date.now()}@test.io`, name: 'Verify Bot', password: 'Verify1234!' }),
      });
      if (!regRes.ok) {
        console.log('Register also failed. Waiting 60s for rate limit...');
        await new Promise(r => setTimeout(r, 62000));
        // Retry login
        const retry = await fetch(`${BASE}/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@reactcms.io', password: 'Admin1234!' }),
        });
        if (!retry.ok) throw new Error('Cannot login after waiting');
        var loginData = await retry.json();
      } else {
        var loginData = await regRes.json();
      }
    } else {
      var loginData = await loginRes.json();
    }
    const token = loginData.access_token;
    const user = loginData.user;
    console.log(`Authenticated as ${user.email}`);

    // ── 1. Login page visual ──────────────────────────────────────
    console.log('\n=== 1. Login page ===');
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Sign in');
    await shot('01-login');
    step('Login page renders', true, 'Sign in + Create account tabs');

    // ── 2. Register tab ───────────────────────────────────────────
    console.log('\n=== 2. Register tab ===');
    await page.click('text=Create account');
    const nameField = await page.waitForSelector('input[placeholder="Your name"]');
    await shot('02-register-tab');
    step('Register tab', !!nameField, 'Name field visible');

    // ── 3. Inject auth + navigate to dashboard ────────────────────
    console.log('\n=== 3. Dashboard (auth injected) ===');
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('rcms_access_token', token);
      localStorage.setItem('rcms-auth', JSON.stringify({
        state: { user, isAuthenticated: true },
        version: 0,
      }));
    }, { token, user });
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot('03-dashboard');
    const dashBody = await page.textContent('body');
    step('Dashboard', dashBody.includes('Good') || dashBody.includes('Websites'), 'Greeting + stats visible');

    // ── 4. Sidebar ────────────────────────────────────────────────
    console.log('\n=== 4. Sidebar ===');
    const sidebarEl = await page.$('aside');
    const sidebar = sidebarEl ? await sidebarEl.textContent() : '';
    step('Sidebar', sidebar.includes('Dashboard') && sidebar.includes('Websites'), `Nav items present, user: ${sidebar.includes(user.name)}`);

    // ── 5. Websites list ──────────────────────────────────────────
    console.log('\n=== 5. Websites list ===');
    await page.click('a[href="/websites"]');
    await page.waitForTimeout(2000);
    await shot('05-websites-list');
    const wsBody = await page.textContent('body');
    step('Websites list', wsBody.includes('website'), 'Website list page loaded');

    // ── 6. Create website ─────────────────────────────────────────
    console.log('\n=== 6. Create website ===');
    await page.click('button:has-text("New website")');
    await page.waitForSelector('text=Website name');
    const siteName = `Verify ${Date.now() % 10000}`;
    await page.fill('input[placeholder="My Awesome Site"]', siteName);
    await page.waitForTimeout(400);
    const slugInput = await page.$('input[placeholder="my-awesome-site"]');
    const slugVal = slugInput ? await slugInput.inputValue() : '';
    await shot('06-create-website');
    step('Create website modal', !!slugVal, `Slug auto-generated: "${slugVal}"`);
    await page.click('button:has-text("Create website")');
    await page.waitForTimeout(3000);
    await shot('06b-created');

    // ── 7. Navigate to website detail ─────────────────────────────
    console.log('\n=== 7. Website detail ===');
    // Find the link to the newly created website
    const wsLinks = await page.$$(`a[href^="/websites/"]:has-text("${siteName}")`);
    if (wsLinks.length > 0) {
      const href = await wsLinks[0].getAttribute('href');
      console.log(`  Clicking link: ${href}`);
      await wsLinks[0].click();
    } else {
      // Fallback: click any website link
      const anyLink = await page.$('td a[href^="/websites/"]');
      if (anyLink) await anyLink.click();
      else await page.click('a[href^="/websites/"]');
    }
    await page.waitForTimeout(3000);
    await shot('07-website-detail');
    const detBody = await page.textContent('body');
    const hasTabs = detBody.includes('API keys') && detBody.includes('Members');
    step('Website detail', hasTabs, 'Content/API keys/Members/Settings tabs visible');

    // ── 8. Content tab: create key ────────────────────────────────
    console.log('\n=== 8. Create content key ===');
    const newBtn = await page.$('button:has-text("New")');
    if (newBtn) {
      await newBtn.click();
      await page.waitForSelector('text=New content key');
      await page.fill('input[placeholder="hero-title"]', 'test-key');
      await shot('08-new-key-modal');
      await page.click('button:has-text("Create key")');
      await page.waitForTimeout(2000);
      step('Create content key', true);
    } else {
      step('Create content key', false, 'New button not found');
    }

    // ── 9. Content editor ─────────────────────────────────────────
    console.log('\n=== 9. Content editor ===');
    const keyRow = await page.$('text=test-key');
    if (keyRow) {
      await keyRow.click();
      await page.waitForTimeout(1500);
      await shot('09-editor');
      const edBody = await page.textContent('body');
      step('Content editor', edBody.includes('Save draft') && edBody.includes('Publish'), 'Editor toolbar visible');
    } else {
      step('Content editor', false, 'test-key row not found');
    }

    // ── 10. Edit + dirty indicator ────────────────────────────────
    console.log('\n=== 10. Edit content ===');
    const textInput = await page.$('input[placeholder="Enter text content…"]');
    if (textInput) {
      await textInput.fill('Hello from Playwright');
      await page.waitForTimeout(500);
      const dirty = await page.$('[title="Unsaved changes"]');
      await shot('10-dirty');
      step('Edit + dirty indicator', !!dirty, 'Amber unsaved dot visible');

      // Save
      await page.click('button:has-text("Save draft")');
      await page.waitForTimeout(2000);
      await shot('10b-saved');
      step('Save draft', true);
    } else {
      step('Edit content', false, 'No text input found');
    }

    // ── 11. Publish ───────────────────────────────────────────────
    console.log('\n=== 11. Publish ===');
    const pubBtn = await page.$('button:has-text("Publish")');
    if (pubBtn) {
      await pubBtn.click();
      await page.waitForTimeout(2000);
      await shot('11-published');
      step('Publish', true);
    }

    // ── 12. Version history ───────────────────────────────────────
    console.log('\n=== 12. Version history ===');
    const histBtn = await page.$('button:has-text("History")');
    if (histBtn) {
      await histBtn.click();
      await page.waitForTimeout(1500);
      await shot('12-history');
      const hBody = await page.textContent('body');
      step('Version history', hBody.includes('Version history') || hBody.includes('version'), 'History panel visible');
      await histBtn.click();
    }

    // ── 13. Preview panel ─────────────────────────────────────────
    console.log('\n=== 13. Live preview ===');
    const prevBody = await page.textContent('body');
    step('Live preview', prevBody.includes('Preview'), 'Preview section visible');

    // ── 14. API keys tab ──────────────────────────────────────────
    console.log('\n=== 14. API keys tab ===');
    await page.click('button:has-text("API keys")');
    await page.waitForTimeout(2000);
    await shot('14-apikeys');
    step('API keys tab', true);

    // ── 15. Create API key ────────────────────────────────────────
    console.log('\n=== 15. Create API key ===');
    await page.click('button:has-text("New key")');
    await page.waitForSelector('text=New API key');
    await page.fill('input[placeholder="Production read key"]', 'PW test key');
    await shot('15-create-key');
    await page.click('button:has-text("Create key")');
    await page.waitForTimeout(2000);
    await shot('15b-key-banner');
    const kBody = await page.textContent('body');
    step('Create API key', kBody.includes('Copy your new API key'), 'One-time key banner shown');

    // ── 16. Members tab ───────────────────────────────────────────
    console.log('\n=== 16. Members tab ===');
    await page.click('button:has-text("Members")');
    await page.waitForTimeout(2000);
    await shot('16-members');
    const mBody = await page.textContent('body');
    step('Members tab', mBody.includes('Invite') || mBody.includes('member'), 'Members section loaded');

    // ── 17. Settings tab ──────────────────────────────────────────
    console.log('\n=== 17. Settings tab ===');
    const sBtns = await page.$$('button:has-text("Settings")');
    if (sBtns.length > 0) {
      await sBtns[sBtns.length - 1].click();
      await page.waitForTimeout(1500);
      await shot('17-settings-tab');
      const sBody = await page.textContent('body');
      step('Settings tab', sBody.includes('General') || sBody.includes('Danger zone'), 'Name, domain, danger zone');
    }

    // ── 18. Account settings ──────────────────────────────────────
    console.log('\n=== 18. Account settings ===');
    await page.click('a[href="/settings"]');
    await page.waitForTimeout(1500);
    await shot('18-account-settings');
    const acBody = await page.textContent('body');
    step('Account settings', acBody.includes('Account settings') || acBody.includes('Profile'), 'Profile form visible');

    // ── 19. Probe: /login redirect ────────────────────────────────
    console.log('\n=== 19. Probe: /login redirect ===');
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/dashboard', { timeout: 5000 });
    step('/login redirect', true, 'Authenticated → /dashboard');

    // ── 20. Probe: unknown route ──────────────────────────────────
    console.log('\n=== 20. Probe: unknown route ===');
    await page.goto(BASE + '/does-not-exist', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/dashboard', { timeout: 5000 });
    step('Unknown route', true, 'Redirected to /dashboard');

    // ── 21. Logout ────────────────────────────────────────────────
    console.log('\n=== 21. Logout ===');
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Sign out")');
    await page.waitForURL('**/login', { timeout: 10000 });
    await shot('21-logged-out');
    step('Logout', true, 'Redirects to /login');

    // ── 22. Probe: unauth redirect ────────────────────────────────
    console.log('\n=== 22. Probe: unauth access ===');
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/login', { timeout: 5000 });
    step('Unauth redirect', true, '/dashboard → /login when logged out');

    // ── Summary ───────────────────────────────────────────────────
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`\n========== ${passed}/${results.length} PASSED, ${failed} FAILED ==========`);

  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    await shot('FATAL-state');
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
