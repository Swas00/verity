// A sweep of the whole site for the kind of problem a judge would hit: console errors, failed requests, horizontal
// scrolling, a hidden main button, and broken internal links, in both themes and at laptop and phone sizes.
// Usage: WEB=http://127.0.0.1:3000 node e2e/smoke.mjs   (stack must be running)
import { chromium } from 'playwright-core';

const WEB = process.env.WEB || 'http://127.0.0.1:3000';
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const problems = [];
const ROUTES = ['/', '/about', '/roadmap', '/queue', '/review', '/visual', '/brand', '/dashboard', '/drift', '/audit', '/report?token=nope'];

async function sweep(label, { width, height, theme }) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript((t) => localStorage.setItem('verity_theme', t), theme);
  const p = await ctx.newPage();
  let here = '';
  p.on('pageerror', (e) => problems.push(`${label} ${here}: pageerror ${String(e).slice(0, 120)}`));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && problems.push(`${label} ${here}: console ${m.text().slice(0, 120)}`));
  p.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/public/report/nope') && !/favicon/.test(r.url())) problems.push(`${label} ${here}: HTTP ${r.status()} ${r.url().replace(WEB, '').slice(0, 80)}`); });
  p.on('requestfailed', (r) => { if (!/spline|splinetool|_rsc=/.test(r.url()))   // Next's background page prefetches are cancelled when the page navigates away; that is normal
    problems.push(`${label} ${here}: request failed ${r.url().slice(0, 80)}`); });
  await p.goto(WEB + '/'); await p.getByRole('button', { name: /Rajan · Manager/ }).click(); await p.waitForURL('**/queue');
  for (const route of ROUTES) {
    here = route; await p.goto(WEB + route); await p.waitForLoadState('networkidle'); await p.waitForTimeout(600);
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) problems.push(`${label} ${route}: horizontal scrolling`);
    if (await p.locator('h1').count() === 0 && route !== '/review') problems.push(`${label} ${route}: no heading`);
  }
  await ctx.close();
}

for (const [name, o] of [['laptop dark', { width: 1366, height: 700, theme: 'dark' }], ['laptop light', { width: 1366, height: 700, theme: 'light' }], ['phone dark', { width: 375, height: 760, theme: 'dark' }], ['phone light', { width: 375, height: 760, theme: 'light' }]]) await sweep(name, o);
check('no console errors, failed requests, horizontal scrolling or missing headings on any page, in both themes at laptop and phone size', problems.length === 0, problems.slice(0, 6).join(' | '));

// The main button on the first screen, on short laptop screens
for (const [w, h] of [[1366, 700], [1280, 720], [1440, 780], [1440, 900]]) {
  const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto(WEB + '/'); await p.waitForLoadState('networkidle');
  const r = await p.evaluate(() => ({ btn: [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Start judge walkthrough')).getBoundingClientRect().bottom, bar: document.querySelector('nav[aria-label="Judge walkthrough"]').getBoundingClientRect().top }));
  check(`${w}x${h}: Start judge walkthrough is fully visible above the walkthrough bar`, r.btn <= r.bar, `${Math.round(r.btn)} <= ${Math.round(r.bar)}`);
  await p.close();
}

// Every internal link on the landing page resolves
const p = await (await browser.newContext()).newPage();
await p.goto(WEB + '/');
const links = await p.locator('a[href^="/"]').evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute('href')))]);
const bad = [];
for (const l of links) { const r = await p.request.get(WEB + l); if (r.status() >= 400) bad.push(`${l} ${r.status()}`); }
check('every internal link on the landing page opens', bad.length === 0 && links.length >= 2, bad.join(', ') || `${links.length} links`);

await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll smoke checks passed');
process.exit(failed ? 1 : 0);
