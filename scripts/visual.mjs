// Usage: node scripts/visual.mjs <url> <outDir>
// Drives the app in headless Firefox at the reference tablet viewport (1180×820, dpr 2,
// touch), saves screenshots and asserts every toolbar and step-panel button is at least
// 44×44 CSS px. Plays an entrance plus a second room by tapping the map and typing dice.
// Exits non-zero on undersized buttons, a wrong play-flow step, the panel overlapping the
// map, or any page error.
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
  await page.waitForTimeout(250); // let the canvas paint the latest overlay
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

// ---- Play flow helpers ----

/** Tap the map at a world point (squares), using the camera MapView exposes on the canvas. */
const tapWorld = async (x, y) => {
  const at = await page.$eval(
    'canvas',
    (c, [wx, wy]) => {
      const [cx, cy, s] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * s, y: r.top + (wy - cy) * s };
    },
    [x, y],
  );
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(150);
};
const stepIs = async (want, where) => {
  const got = await page.getAttribute('aside.panel .body', 'data-step');
  console.log(`Step after ${where}: ${got}`);
  if (got !== want) problems.push(`after ${where}: expected step "${want}", got "${got}"`);
};
const typeDice = async (...values) => {
  const inputs = await page.$$('aside.panel form.dice input');
  for (let i = 0; i < values.length; i++) await inputs[i].fill(values[i]);
};
const panelButton = (name) => page.click(`aside.panel button:text-is("${name}")`);
/** The step panel must sit beside the map, never over it; its buttons must be touch-sized. */
const checkPanel = async (where) => {
  const [map, panel] = await Promise.all([page.$eval('canvas', (c) => c.getBoundingClientRect().toJSON()), page.$eval('aside.panel', (p) => p.getBoundingClientRect().toJSON())]);
  const overlaps = panel.left < map.right - 0.5 && panel.top < map.bottom - 0.5;
  if (overlaps) problems.push(`${where}: step panel overlaps the map (${JSON.stringify({ map, panel })})`);
  const small = await page.$$eval('aside.panel button', (els) =>
    els.map((el) => ({ t: el.textContent?.trim(), r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0 && (b.r.width < 44 || b.r.height < 44)).map((b) => `${b.t} ${b.r.width}×${b.r.height}`),
  );
  for (const b of small) problems.push(`${where}: panel button too small: ${b}`);
};

// 2. Entrance: tap the square below the bottom edge at x=12, then type red 3, blue 4.
await tapWorld(12.5, 25.5);
await stepIs('size', 'tapping the entrance square');
await typeDice('3', '4');
await checkPanel('entrance size');
await shot('02-entrance-size.png');
await panelButton('Use these');
await stepIs('position', 'entering the entrance dice');
await checkPanel('entrance position');
await shot('03-position.png');
await panelButton('Place');
await stepIs('exits', 'placing the entrance room');
await checkPanel('entrance exits');
await shot('04-exits.png');
await panelButton('Done');
await stepIs('label', 'accepting the entrance exits');
await checkPanel('entrance label');
await shot('05-label.png');
await panelButton('Done');
await stepIs('idle', 'labelling the entrance room');
await page.waitForTimeout(1500); // token walks in

// 3. Room 2 from the entrance room's north exit (12,20): doubles 4-4, then 2-1 → 6×5.
await tapWorld(12.5, 20);
await stepIs('size', 'tapping the north exit');
await typeDice('4', '4');
await panelButton('Use these');
if (!(await page.isVisible('aside.panel .double'))) problems.push('doubles did not ask for a second roll');
await typeDice('2', '1');
await panelButton('Use these');
await stepIs('position', 'entering room 2 dice');
await panelButton('Place');
await stepIs('exitCount', 'placing room 2');
await typeDice('5'); // two exits
await panelButton('Use this');
await stepIs('exitType', 'the exit count');
await page.click('aside.panel button:has-text("Wooden door")');
await stepIs('exits', 'choosing wooden doors');
await tapWorld(12.5, 15); // the north wall, by tapping
await typeDice('2');
await panelButton('Place for me'); // the other one clockwise from the typed D6
await panelButton('Done');
await stepIs('label', 'placing room 2 exits');
await page.fill('aside.panel input[type="text"]', 'Guard Room');
await panelButton('Done');
await stepIs('idle', 'labelling room 2');
await page.waitForTimeout(2500); // token walks into room 2
await checkPanel('two rooms');
await shot('06-two-rooms.png');

// 4. Mid-flow rotation: start a room from the west exit, then resize to portrait.
await tapWorld(10, 22.5);
await typeDice('3', '2');
await panelButton('Use these');
await stepIs('position', 'starting a room from the west exit');
await page.setViewportSize({ width: 820, height: 1180 });
await page.waitForTimeout(600);
await stepIs('position', 'rotating to portrait');
await checkPanel('portrait mid-flow');
await shot('07-portrait-midflow.png');
await page.setViewportSize({ width: 1180, height: 820 });
await page.waitForTimeout(400);

// 5. Ctrl+Z during a draft cancels the draft and undoes; Ctrl+Shift+Z redoes.
await page.click('header.toolbar .coverage'); // focus out of the dice inputs
await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
await stepIs('idle', 'Ctrl+Z mid-draft');
const undoLabel = (await page.textContent('header.toolbar button.history'))?.trim();
console.log(`Undo button after Ctrl+Z: ${undoLabel}`);
if (!undoLabel?.includes('Add entrance')) problems.push(`Ctrl+Z did not undo Room 2: "${undoLabel}"`);
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(300);

// 6. Menu open.
await page.click('header.toolbar button[aria-label="Menu"]');
await page.waitForTimeout(200);
await shot('08-menu.png');

// 7. Load the demo map (the map has content now, so confirm), then wheel-zoom on the map.
await page.click('text=Load demo map');
await page.click('button:has-text("Replace map")');
await page.waitForTimeout(500);
const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -240);
await page.waitForTimeout(500);
await shot('09-demo.png');

// 8. New map dialog shows the discard confirmation over a map with content.
await page.click('header.toolbar button[aria-label="Menu"]');
await page.click('text=New map…');
await page.click('button:has-text("Create")');
await page.waitForTimeout(200);
await shot('10-new-map-confirm.png');
if (!(await page.isVisible("text=This replaces the current map — there's no saving yet"))) problems.push('new map confirmation not shown');

await browser.close();
if (errors.length) problems.push('page errors:\n' + errors.join('\n'));
if (problems.length) {
  console.error('Visual check FAILED:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Visual check passed');
