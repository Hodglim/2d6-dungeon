// Usage: node scripts/visual.mjs <url> <outDir>
// Drives the app in headless Firefox at the reference tablet viewport (1180×820, dpr 2,
// touch), saves screenshots and asserts every toolbar button is at least 44×44 CSS px.
// Exits non-zero on undersized buttons, a missing panel hint, or any page error.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { firefox } from 'playwright';

const [url = 'http://localhost:5173', outDir = 'visual'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
const problems = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1000);

const shot = async (name) => {
  const path = join(outDir, name);
  await page.screenshot({ path });
  console.log(`Saved ${path}`);
};

// 1. Empty new map: toolbar, map, panel hint.
await shot('01-empty.png');
const buttons = await page.$$eval('header.toolbar button', (els) =>
  els.map((el) => {
    const r = el.getBoundingClientRect();
    return { label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '', w: r.width, h: r.height };
  }),
);
if (buttons.length < 8) problems.push(`expected at least 8 toolbar buttons, found ${buttons.length}`);
for (const b of buttons) {
  const ok = b.w >= 44 && b.h >= 44;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${b.w.toFixed(1)}×${b.h.toFixed(1)}  ${b.label}`);
  if (!ok) problems.push(`toolbar button "${b.label}" is ${b.w.toFixed(1)}×${b.h.toFixed(1)}`);
}
const hint = await page.textContent('aside.panel .hint');
console.log(`Panel hint: ${hint}`);
if (hint?.trim() !== 'Tap a square on the bottom edge to place the entrance') problems.push(`unexpected panel hint: ${hint}`);
const coverageText = (await page.textContent('header.toolbar .coverage'))?.trim();
console.log(`Coverage badge: ${coverageText}`);
if (coverageText !== '0%') problems.push(`unexpected coverage badge: ${coverageText}`);

// 2. Menu open.
await page.click('header.toolbar button[aria-label="Menu"]');
await page.waitForTimeout(200);
await shot('02-menu.png');

// 3. Load the demo map (empty map, so no confirmation), then wheel-zoom on the map.
await page.click('text=Load demo map');
await page.waitForTimeout(500);
const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -240);
await page.waitForTimeout(500);
await shot('03-demo.png');

// 4. New map dialog shows the discard confirmation over a map with content.
await page.click('header.toolbar button[aria-label="Menu"]');
await page.click('text=New map…');
await page.click('button:has-text("Create")');
await page.waitForTimeout(200);
await shot('04-new-map-confirm.png');
if (!(await page.isVisible("text=This replaces the current map — there's no saving yet"))) problems.push('new map confirmation not shown');

await browser.close();
if (errors.length) problems.push('page errors:\n' + errors.join('\n'));
if (problems.length) {
  console.error('Visual check FAILED:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Visual check passed');
