// Usage: node scripts/screenshot.mjs <url> <out.png> [width] [height]
// Opens the app in headless Firefox and saves a screenshot, for visual checks.
import { firefox } from 'playwright';

const [url = 'http://localhost:5173', out = 'screenshot.png', w = '1400', h = '900'] = process.argv.slice(2);
const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`Saved ${out}`);
