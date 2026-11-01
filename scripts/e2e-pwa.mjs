// Usage: node scripts/e2e-pwa.mjs
// Offline + update check (Review Focus 5). Builds with BUILD_ID=build-A, serves dist with `vite preview`,
// loads the app, waits for the service worker, reloads OFFLINE and checks the app renders, then rebuilds as
// build-B, reloads online and checks that (1) the update prompt appears, (2) the old build keeps running until
// the click, (3) clicking it reloads once into build-B. Finally rebuilds dist normally. Exits non-zero on failure.
import { spawn, spawnSync } from 'node:child_process';
import { firefox } from 'playwright';

const PORT = 4174;
const URL = `http://localhost:${PORT}/`;
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
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
const stop = () => preview.kill('SIGTERM'); // only the process started here, by handle
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(URL)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await firefox.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const buildOf = () => page.evaluate(() => document.documentElement.dataset.build);

  await page.goto(URL, { waitUntil: 'load' });
  check((await buildOf()) === 'build-A', 'first load runs build-A');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // A first install must not prompt; wait for the worker to claim the page.
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  check((await page.locator('text=New version available').count()) === 0, 'no update prompt after first install');

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('header.toolbar', { timeout: 10000 });
  check((await buildOf()) === 'build-A', 'offline reload renders the app (build-A)');
  await ctx.setOffline(false);

  build('build-B');
  await page.reload({ waitUntil: 'load' });
  check((await buildOf()) === 'build-A', 'old build keeps running until the user accepts the update');
  const prompt = page.locator('text=New version available');
  await prompt.waitFor({ timeout: 15000 }).catch(() => {});
  check((await prompt.count()) === 1, 'update prompt appears after a new build');

  let navs = 0;
  page.on('framenavigated', (f) => f === page.mainFrame() && navs++);
  await page.getByRole('button', { name: 'Reload' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.build === 'build-B', null, { timeout: 15000 }).catch(() => {});
  check((await buildOf()) === 'build-B', 'new build (build-B) is active after clicking the prompt');
  await page.waitForTimeout(1500);
  check(navs === 1, `page reloaded exactly once (navigations: ${navs})`);
  check((await page.locator('text=New version available').count()) === 0, 'prompt gone after update');
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
