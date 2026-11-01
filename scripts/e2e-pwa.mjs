// Usage: node scripts/e2e-pwa.mjs
// Offline + update check (Review Focus 5). Builds with BUILD_ID=build-A, serves dist with a Cloudflare-like server (308 /index.html -> /),
// loads the app, waits for the service worker, reloads OFFLINE and checks the app renders, then rebuilds as
// build-B, reloads online and checks that (1) the update prompt appears, (2) the old build keeps running until
// the click, (3) clicking it reloads once into build-B. Finally rebuilds dist normally. Exits non-zero on failure.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { firefox } from 'playwright';

const PORT = 4174;
const APP_URL = `http://localhost:${PORT}/`;
const build = (id) => {
  const r = spawnSync('node', ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'error'], {
    stdio: 'inherit',
    env: { ...process.env, BUILD_ID: id },
  });
  if (r.status !== 0) throw new Error(`build ${id} failed`);
};
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!ok) failures.push(msg);
};

build('build-A');
// Static server over dist/ that behaves like Cloudflare Pages: /index.html answers 308 -> / (a redirected response
// must never end up serving a navigation from the service worker cache).
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, APP_URL).pathname;
  if (path === '/index.html') {
    res.writeHead(308, { Location: '/' }).end();
    return;
  }
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join('dist', rel));
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(PORT, r));
const stop = () => server.close();
let browser;
try {
  browser = await firefox.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const buildOf = () => page.evaluate(() => document.documentElement.dataset.build);

  await page.goto(APP_URL, { waitUntil: 'load' });
  check((await buildOf()) === 'build-A', 'first load runs build-A');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // A first install must not prompt; wait for the worker to claim the page.
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  check((await page.locator('text=New version available').count()) === 0, 'no update prompt after first install');

  // Update from the page that was open at first install (it had no controller at load): the click must still reload.
  const prompt = page.locator('text=New version available');
  let navs = 0;
  page.on('framenavigated', (f) => f === page.mainFrame() && navs++);
  const updateTo = async (id, via) => {
    build(id);
    if (via === 'update') await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    else await page.reload({ waitUntil: 'load' });
    await prompt.waitFor({ timeout: 15000 }).catch(() => {});
    check((await prompt.count()) === 1, `update prompt appears for ${id}`);
    check((await buildOf()) !== id, `old build keeps running until the user accepts ${id}`);
    navs = 0;
    await page.getByRole('button', { name: 'Reload' }).click();
    await page.waitForFunction((b) => document.documentElement.dataset.build === b, id, { timeout: 15000 }).catch(() => {});
    check((await buildOf()) === id, `${id} is active after clicking the prompt`);
    await page.waitForTimeout(1500);
    check(navs === 1, `page reloaded exactly once (navigations: ${navs})`);
    check((await prompt.count()) === 0, 'prompt gone after update');
  };
  await updateTo('build-B', 'update');

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('header.toolbar', { timeout: 10000 });
  check((await buildOf()) === 'build-B', 'offline reload renders the app (index.html redirects like Cloudflare)');
  await ctx.setOffline(false);

  await updateTo('build-C', 'reload');
  const caches = await page.evaluate(() => caches.keys());
  check(caches.length === 1, `old caches cleaned up (${caches.join(', ')})`);
  check(errors.length === 0, `no page errors ${errors.join('; ')}`);
} catch (e) {
  console.error(e);
  failures.push(String(e));
} finally {
  await browser?.close();
  stop();
  build(Date.now().toString(36)); // leave dist/ as a normal build, not build-B
}
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nPWA e2e OK');
