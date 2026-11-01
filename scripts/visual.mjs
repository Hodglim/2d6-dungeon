// Usage: node scripts/visual.mjs <url> <outDir>
// Drives the app in headless Firefox at the reference tablet viewport (1180×820, dpr 2,
// touch), saves screenshots and asserts every toolbar and step-panel button is at least
// 44×44 CSS px. Plays an entrance plus a second room by tapping the map and typing dice,
// then uses the Door, Stairs, Note and Select tools on it.
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
await page.waitForTimeout(1500); // token walks in (also longer than the autosave debounce)

// 2b. Reload: the autosave brings the entrance back, with its undo step.
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1000);
const undoAfterReload = (await page.textContent('header.toolbar button.history'))?.replace(/\s+/g, ' ').trim();
console.log(`Undo after reload: ${undoAfterReload}`);
if (!undoAfterReload?.endsWith('Undo Add entrance')) problems.push(`after reload the undo button reads "${undoAfterReload}", expected "Undo Add entrance"`);
if ((await page.textContent('header.toolbar .coverage'))?.trim() === '0%') problems.push('after reload the map is empty');
await stepIs('idle', 'reloading');
await shot('20-after-reload.png');

// 3. Room 2 from the entrance room's north exit (12,20): doubles 4-4, then 2-1 → 6×5.
await tapWorld(12.5, 20);
await stepIs('size', 'tapping the north exit');
await typeDice('4', '4');
await panelButton('Use these');
if (!(await page.isVisible('aside.panel .double'))) problems.push('doubles did not ask for a second roll');
await typeDice('2', '1');
await panelButton('Use these');
await stepIs('position', 'entering room 2 dice');

// 3b. Ghost follows the pointer: mouse hover and a one-finger drag slide it, never pan.
const canvasAttr = (n) => page.getAttribute('canvas', n);
const ghostOf = async () => (await canvasAttr('data-ghost')) ?? '';
const hoverAt = async (wx, wy) =>
  page.$eval(
    'canvas',
    (c, [x, y]) => {
      const [cx, cy, s] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (x - cx) * s, y: r.top + (y - cy) * s };
    },
    [wx, wy],
  );
const camBefore = await canvasAttr('data-camera');
const ghostStart = await ghostOf();
console.log(`Ghost at start: ${ghostStart}`);
// Room 2 is 6x5 north of the exit at (12,20); the exit square is x=12. Move well to the left.
const [gx, gy, gw, gh] = ghostStart.split(',').map(Number);
const left = await hoverAt(gx + 0.5, gy + gh / 2);
await page.mouse.move(left.x + 60, left.y);
await page.mouse.move(left.x, left.y, { steps: 6 });
await page.waitForTimeout(250);
const ghostMouse = await ghostOf();
console.log(`Ghost after mouse hover: ${ghostMouse}`);
if (ghostMouse === ghostStart) problems.push('mouse hover did not move the ghost');
if ((await canvasAttr('data-camera')) !== camBefore) problems.push('mouse hover panned the camera');
await stepIs('position', 'hovering the ghost');
// One-finger touch drag back to the right end of the wall, via CDP touch events.
const cdp = await page.context().newCDPSession(page).catch(() => null);
const right = await hoverAt(gx + gw - 0.5, gy + gh / 2);
const touchDrag = async (from, to) => {
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    // Firefox has no CDP: dispatch pointer events with pointerType touch on the canvas.
    await page.$eval(
      'canvas',
      (c, [a, b]) => {
        const fire = (type, p) =>
          c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: p.x, clientY: p.y, buttons: type === 'pointerup' ? 0 : 1, button: 0 }));
        c.setPointerCapture = () => {};
        fire('pointerdown', a);
        for (let i = 1; i <= 8; i++) fire('pointermove', { x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 });
        fire('pointerup', b);
      },
      [from, to],
    );
  }
  await page.waitForTimeout(250);
};
await touchDrag(left, right);
const ghostTouch = await ghostOf();
console.log(`Ghost after touch drag: ${ghostTouch}`);
if (ghostTouch === ghostMouse) problems.push('one-finger drag did not move the ghost');
if ((await canvasAttr('data-camera')) !== camBefore) problems.push('one-finger drag panned the camera');
await stepIs('position', 'dragging the ghost');
await shot('13-ghost-follows.png');
// A mouse click on a valid spot slides the ghost there and places the room.
const [tx, ty, tw, th] = (await ghostOf()).split(',').map(Number);
await tapWorld(tx + tw / 2, ty + th / 2);
await stepIs('exitCount', 'clicking to place room 2');
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

// 5b. Editor tools on the two-room map (entrance room x11–13 y21–24; Room 2 y15–19 entered
// through the door at (12,20); Room 2's north exit at (12,15) leads to an exit square at (12,14)).
const useTool = (name) => page.click(`header.toolbar button.tool:text-is("${name}")`);
const undoText = async () => (await page.textContent('header.toolbar button.history'))?.trim() ?? '';
const expectUndo = async (label, where) => {
  const got = await undoText();
  console.log(`Undo button after ${where}: ${got}`);
  if (!got.includes(label)) problems.push(`after ${where}: expected Undo "${label}", got "${got}"`);
};
const removeButtons = () => page.locator('aside.panel button:has-text("Remove")').count();

// Door: lock Room 2's north exit with quality 7 (closed padlock with a 7).
await useTool('Door');
await tapWorld(12.5, 15);
if (!(await page.isVisible('aside.panel [data-editor="door"] >> text=Padlock'))) problems.push('door editor did not open on a door tap');
await panelButton('Locked');
await expectUndo('Edit door', 'locking the door');
await page.fill('aside.panel input[name="quality"]', '7');
await panelButton('Set');
await expectUndo('Edit door', 'setting quality 7');
await checkPanel('door editor');
// Zoom in on the door so the padlock and its number are legible in the screenshot.
const doorAt = await page.$eval('canvas', (c) => {
  const [cx, cy, s] = (c.dataset.camera ?? '').split(',').map(Number);
  const r = c.getBoundingClientRect();
  return { x: r.left + (12.5 - cx) * s, y: r.top + (15 - cy) * s };
});
await page.mouse.move(doorAt.x, doorAt.y);
await page.mouse.wheel(0, -600);
await page.waitForTimeout(500);
await shot('11-door-locked.png');
await page.mouse.wheel(0, 600); // and back out, so the rest of the map stays in view
await page.waitForTimeout(500);

// An entry door (Room 2 was entered through (12,20)) has no Remove button, and says why.
await tapWorld(12.5, 20);
if (!(await page.isVisible('aside.panel [data-editor="door"]'))) problems.push("door editor did not open on Room 2's entry door");
const entryRemove = await removeButtons();
console.log(`Remove buttons for Room 2's entry door: ${entryRemove}`);
if (entryRemove !== 0) problems.push(`entry door shows ${entryRemove} Remove button(s)`);
if (!(await page.isVisible('aside.panel >> text=This is how Room 2 was entered'))) problems.push('entry door note missing');
// The open exit beyond the exit square is nobody's entry door: it can be removed.
await tapWorld(12.5, 14);
if ((await removeButtons()) !== 1) problems.push('a non-entry door has no Remove button');
// A bare edge inside Room 2 is refused with checkDoorTool's reason.
await tapWorld(12.5, 17.05);
if (!(await page.isVisible('aside.panel >> text=That is inside a room'))) problems.push('inside-room edge was not refused');

// Stairs: add (down) on a floor square, then turn them up.
await useTool('Stairs');
await tapWorld(12.5, 17.5);
await expectUndo('Add stairs', 'adding stairs');
await panelButton('Up');
await expectUndo('Edit stairs', 'turning the stairs up');

// Note: write one on a floor square.
await useTool('Note');
await tapWorld(12.5, 18.5);
await page.fill('aside.panel textarea', 'Rats behind the crates');
await panelButton('Add note');
await expectUndo('Add note', 'adding a note');

// Select: Room 2's details; nothing to move, resize or delete it.
await useTool('Select');
await tapWorld(12.5, 16.5);
const inspector = (await page.innerText('aside.panel [data-editor="room"]')).replace(/\s+/g, ' ').trim();
console.log(`Inspector: ${inspector}`);
for (const want of ['Room 2', 'Size 6×5', 'Class normal', 'Exits 2']) {
  if (!inspector.toLowerCase().includes(want.toLowerCase())) problems.push(`inspector is missing "${want}"`);
}
const typeValue = await page.inputValue('aside.panel [data-editor="room"] input[type="text"]');
if (typeValue !== 'Guard Room') problems.push(`inspector room type is "${typeValue}"`);
const roomButtons = await page.$$eval('aside.panel button', (els) => els.map((el) => el.textContent?.trim() ?? ''));
const forbidden = roomButtons.filter((t) => /move|resize|delete|remove/i.test(t));
if (forbidden.length) problems.push(`inspector has room-changing buttons: ${forbidden.join(', ')}`);
await checkPanel('room inspector');
await shot('12-inspector.png');
await useTool('Play');

// 6. Menu open.
await page.click('header.toolbar button[aria-label="Menu"]');
await page.waitForTimeout(200);
await shot('08-menu.png');

// 7. Load the demo map (the map has content now, so confirm), then wheel-zoom on the map.
await page.click('text=Load demo map');
await page.click('[role=alertdialog] button:text-is("Replace")');
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
await page.click('button:text-is("Create")');
await page.waitForTimeout(200);
await shot('10-new-map-confirm.png');
if (!(await page.isVisible('text=This replaces your current game.'))) problems.push('new game confirmation not shown');

await browser.close();
if (errors.length) problems.push('page errors:\n' + errors.join('\n'));
if (problems.length) {
  console.error('Visual check FAILED:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Visual check passed');
