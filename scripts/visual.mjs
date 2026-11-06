// Usage: node scripts/visual.mjs <url> <outDir>
// Drives the app in headless Firefox at the reference tablet viewport (1180×820, dpr 2,
// touch), saves screenshots and asserts every toolbar and step-panel button is at least
// 44×44 CSS px. Plays an entrance plus a second room by tapping the map and typing dice,
// then uses the Door, Stairs and Note tools on it, and taps a room in Play to inspect it.
// Exits non-zero on undersized buttons, a wrong play-flow step, the panel overlapping the
// map, or any page error.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { firefox } from 'playwright';

const [url = 'http://localhost:5173', outDir = 'visual'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const browser = await firefox.launch();
// The home-screen hint is tested in step 10; the other steps start with it dismissed so layouts don't shift.
const mainCtx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
// The floating dice roller starts open in "Enter my roll" mode: the map-building steps are typed into it.
await mainCtx.addInitScript(() => {
  localStorage.setItem('2d6.installHintDismissed', '1');
  localStorage.setItem('2d6.diceRoller', JSON.stringify({ open: true, dice: 'd6', enter: true }));
});
const page = await mainCtx.newPage();
const errors = [];
const problems = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1000);

const shot = async (name, pg = page) => {
  await pg.waitForTimeout(250); // let the canvas paint the latest overlay
  const path = join(outDir, name);
  await pg.screenshot({ path });
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

/** Step panel buttons must be touch-sized (for a page other than the main one). */
const checkPanelOn = async (pg, where) => {
  const small = await pg.$$eval('aside.panel button', (els) =>
    els.map((el) => ({ t: el.textContent?.trim(), r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0 && (b.r.width < 44 || b.r.height < 44)).map((b) => `${b.t} ${b.r.width}×${b.r.height}`),
  );
  for (const b of small) problems.push(`${where}: panel button too small: ${b}`);
};


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
// The dice are the floating roller's. "Playing with real dice" lives in the Game menu: this sets it
// explicitly (click only when its state differs, then close the menu), so a check never inverts what an
// earlier one left behind.
const rollerPanel = '[data-testid=dice-panel]';
const realDiceBox = '[role=menu] [data-testid=dice-enter] input';
/** Ticks or unticks "Playing with real dice" in the Game menu; returns what the box showed after. */
const setRealDice = async (p, on) => {
  // Already as wanted (typed boxes with real dice, a Roll button without): leave the menu shut. The
  // unconscious dialog holds the roller over an inert app, so the menu can't be reached there.
  if (await p.isVisible(`${rollerPanel} ${on ? '[data-testid=dice-typed]' : 'button.roll'}`)) return on;
  await p.click('header.toolbar button[aria-label="Menu"]');
  await p.waitForSelector(realDiceBox);
  if ((await p.isChecked(realDiceBox)) !== on) await p.click(realDiceBox);
  const now = await p.isChecked(realDiceBox);
  await p.keyboard.press('Escape');
  await p.waitForSelector('[role=menu]', { state: 'detached' });
  return now;
};
const rollerEnterModeOn = async (p, on) => {
  if (!(await p.isVisible(rollerPanel))) await p.click('header.toolbar button[aria-label="Dice"]');
  await p.waitForSelector(rollerPanel);
  return setRealDice(p, on);
};
/** Types the values into the roller's boxes, in order, and clicks "Use these". */
const rollerEnterOn = async (p, ...values) => {
  await rollerEnterModeOn(p, true);
  const boxes = `${rollerPanel} [data-testid=dice-typed] input`;
  for (let i = 0; i < values.length; i++) await p.fill(`:nth-match(${boxes}, ${i + 1})`, String(values[i]));
  await p.click(`${rollerPanel} [data-testid=dice-typed] button:text-is("Use these")`);
  await p.waitForTimeout(200);
};
const rollerEnter = (...values) => rollerEnterOn(page, ...values);
/** In-memory copy of the fixture where a carried kit item can be thrown and a carried potion is a bomb (the file is unchanged). */
const withThrowing = (fx) => {
  fx.tables.throwingWeapons = [{ name: 'Bootlace', damage: 3 }];
  fx.tables.potionBombs = [{ name: 'Mild Cheer', effect: 'Made up.', damage: '2D6 +1' }];
  return fx;
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
await checkPanel('entrance size');
await shot('02-entrance-size.png');
await rollerEnter('3', '4');
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
// An invalid typed roll: the step's own error shows in the roller, the step stays on "size" and nothing is applied.
await rollerEnter('7', '1');
const sizeError = (await page.textContent(`${rollerPanel} [data-testid=dice-typed] [role=alert]`).catch(() => null))?.trim() ?? '';
console.log(`Room size 7/1 error in the roller: "${sizeError}"`);
if (!sizeError) problems.push('typing 7/1 for the room size showed no error in the roller');
await stepIs('size', 'typing 7/1 for the room size');
await rollerEnter('4', '4');
if (!(await page.isVisible('aside.panel .double'))) problems.push('doubles did not ask for a second roll');
await rollerEnter('2', '1');
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
// A 9 for Exits is refused by the step: its error shows in the roller, nothing is recorded, the typed box keeps the 9.
{
  const histLines = () => page.$$eval(`${rollerPanel} [data-testid=dice-history] li`, (els) => els.length).catch(() => 0);
  const before = await histLines();
  await rollerEnter('9');
  const err = (await page.textContent(`${rollerPanel} [data-testid=dice-typed] [role=alert]`).catch(() => ''))?.trim();
  if (err !== 'Enter a whole number from 1 to 6') problems.push(`typed 9 for Exits: error "${err}"`);
  if ((await histLines()) !== before) problems.push('typed 9 for Exits left a history line');
  if ((await page.inputValue(`${rollerPanel} [data-testid=dice-typed] input`).catch(() => '')) !== '9') problems.push('typed 9 for Exits cleared the box');
  await stepIs('exitCount', 'a rejected 9 for Exits');
  await page.fill(`${rollerPanel} [data-testid=dice-typed] input`, '');
}
await rollerEnter('5'); // two exits
await stepIs('exitType', 'the exit count');
await page.click('aside.panel button:has-text("Wooden door")');
await stepIs('exits', 'choosing wooden doors');
await tapWorld(12.5, 15); // the north wall, by tapping
await rollerEnter('2'); // places the other one clockwise from the typed D6
await panelButton('Done');
await stepIs('label', 'placing room 2 exits');
await page.fill('aside.panel input[type="text"]', 'Lamp Room');
await panelButton('Done');
await stepIs('idle', 'labelling room 2');
await page.waitForTimeout(2500); // token walks into room 2
await checkPanel('two rooms');
await shot('06-two-rooms.png');

// 4. Mid-flow rotation: start a room from the west exit, then resize to portrait.
await tapWorld(10, 22.5);
await rollerEnter('3', '2');
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
// Secret door is the last door type; choosing it makes the door a secret (wooden) door.
{
  const names = await page.$$eval('aside.panel [data-editor="door"] [aria-label="Door type"] button', (els) => els.map((e) => e.textContent?.trim()));
  if (names.at(-1) !== 'Secret door') problems.push(`Secret door is not the last door type: ${names.join(', ')}`);
}
await page.click('aside.panel button:has-text("Secret door")');
await expectUndo('Edit door', 'making the door secret');
if ((await page.textContent('aside.panel [data-editor="door"] h3'))?.trim() !== 'Secret door') problems.push('door editor heading is not "Secret door"');
await checkPanel('door editor');
// Zoom in on the door so the padlock and its number, and the secret door's S, are legible in the screenshot.
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

// A tap on a room in Play: Room 2's details; nothing to move, resize or delete it.
await useTool('Play');
await tapWorld(12.5, 16.5);
const inspector = (await page.innerText('aside.panel [data-editor="room"]')).replace(/\s+/g, ' ').trim();
console.log(`Inspector: ${inspector}`);
for (const want of ['Room 2', 'Size 6×5', 'Class normal', 'Exits 2']) {
  if (!inspector.toLowerCase().includes(want.toLowerCase())) problems.push(`inspector is missing "${want}"`);
}
const typeValue = await page.inputValue('aside.panel [data-editor="room"] input[type="text"]');
if (typeValue !== 'Lamp Room') problems.push(`inspector room type is "${typeValue}"`);
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
await page.click('text=New game…');
await page.click('button:text-is("Start without a hero")');
await page.waitForTimeout(200);
await shot('10-new-map-confirm.png');
if (!(await page.isVisible('text=This replaces your current game.'))) problems.push('new game confirmation not shown');

// 9. A corrupt autosave record (fresh browser context): blocking dialog; Start new game asks first; Cancel leaves it all alone.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(url, { waitUntil: 'load' });
  await p2.waitForTimeout(800); // the app opens (and creates) the database
  const readRecord = () =>
    p2.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('2d6-dungeon-companion', 1);
          r.onsuccess = () => {
            const g = r.result.transaction('saves').objectStore('saves').get('current');
            g.onsuccess = () => resolve(JSON.stringify(g.result ?? null));
            g.onerror = () => reject(g.error);
          };
          r.onerror = () => reject(r.error);
        }),
    );
  await p2.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('2d6-dungeon-companion', 1);
        r.onsuccess = () => {
          const tx = r.result.transaction('saves', 'readwrite');
          tx.objectStore('saves').put({ format: 1, broken: true }, 'current');
          tx.oncomplete = () => resolve(null);
          tx.onerror = () => reject(tx.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
  const corrupt = await readRecord();
  await p2.reload({ waitUntil: 'load' });
  await p2.waitForTimeout(800);
  if (!(await p2.isVisible("text=Your saved game couldn't be loaded"))) problems.push('corrupt record: load-error dialog not shown');
  await p2.screenshot({ path: join(outDir, '21-load-error.png') });
  await p2.click('button:text-is("Start new game")');
  await p2.waitForTimeout(200);
  if (!(await p2.isVisible('text=This replaces your saved game.'))) problems.push('Start new game did not ask for confirmation');
  if (!(await p2.isVisible('button:text-is("Export first")'))) problems.push('damaged-record confirmation lacks Export first');
  await p2.screenshot({ path: join(outDir, '22-load-error-confirm.png') });
  await p2.click('[role=alertdialog] button:text-is("Cancel")');
  await p2.waitForTimeout(1500);
  if (!(await p2.isVisible("text=Your saved game couldn't be loaded"))) problems.push('Cancel did not leave the load-error dialog in place');
  if ((await readRecord()) !== corrupt) problems.push('the damaged record changed without the user choosing');
  await ctx.close();
}

// 10. Home-screen hint: shows in a tab, doesn't cover or break the map, dismisses and stays dismissed; hidden when standalone.
{
  const mk = async (init) => {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForTimeout(800);
    return { ctx, p };
  };
  const geom = (p) => p.evaluate(() => ({
    hint: document.querySelector('[aria-label="Install the app"]')?.getBoundingClientRect().toJSON() ?? null,
    tool: document.querySelector('header.toolbar').getBoundingClientRect().toJSON(),
    map: document.querySelector('canvas').getBoundingClientRect().toJSON(),
    panel: document.querySelector('aside.panel').getBoundingClientRect().toJSON(),
    canvasW: document.querySelector('canvas').width, canvasH: document.querySelector('canvas').height,
  }));
  const hintSel = '[aria-label="Install the app"]';

  // 10a. Empty game in a tab: hint shown, no Export; the map sits below it, canvas matches its box.
  let { ctx, p } = await mk();
  if (!(await p.isVisible(hintSel))) problems.push('hint not shown in a normal tab');
  const g = await geom(p);
  if (g.hint && g.map.top < g.hint.bottom - 0.5) problems.push('hint overlaps the map');
  if (g.hint && g.hint.top < g.tool.bottom - 0.5) problems.push('hint overlaps the toolbar');
  if (Math.abs(g.canvasW - Math.round(g.map.width * 2)) > 2 || Math.abs(g.canvasH - Math.round(g.map.height * 2)) > 2) problems.push(`canvas not resized to map box: ${g.canvasW}x${g.canvasH} vs ${g.map.width}x${g.map.height}`);
  if (g.panel.top < g.hint.bottom - 0.5) problems.push('hint overlaps the panel');
  if (await p.isVisible(`${hintSel} button:text-is("Export")`)) problems.push('Export shown for an empty game');
  console.log(`Hint ${g.hint.height}px tall, map top ${g.map.top}`);
  await p.screenshot({ path: join(outDir, '23-install-hint-empty.png') });

  // 10b. With a room on the map: the move-game line and Export button appear.
  await p.evaluate(() => 0);
  await p.click('header.toolbar button[aria-label="Menu"]');
  await p.click('text=Load demo map');
  await p.waitForTimeout(600);
  if (!(await p.isVisible(`${hintSel} button:text-is("Export")`))) problems.push('hint lacks Export once the map has rooms');
  if (!(await p.isVisible('text=Move this game into the installed app: Export it here, then Import it there'))) problems.push('move-game line missing');
  const small = await p.$$eval(`${hintSel} button`, (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  if (small) problems.push('hint buttons are under 44px');
  const g2 = await geom(p);
  if (g2.map.top < g2.hint.bottom - 0.5) problems.push('hint (with game) overlaps the map');
  await p.screenshot({ path: join(outDir, '24-install-hint-with-game.png') });

  // 10c. The Export button downloads a file.
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click(`${hintSel} button:text-is("Export")`)]);
  if (!dl) problems.push('hint Export did not download a file');

  // 10d. Dismiss: gone, and the map grows; stays gone after a reload.
  await p.click(`${hintSel} button:text-is("Dismiss")`);
  await p.waitForTimeout(400);
  if (await p.isVisible(hintSel)) problems.push('hint still visible after Dismiss');
  const g3 = await geom(p);
  if (g3.map.top > g3.tool.bottom + 0.5) problems.push('map did not close up after the hint was dismissed');
  if (Math.abs(g3.canvasH - Math.round(g3.map.height * 2)) > 2) problems.push('canvas not resized after dismissal');
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(800);
  if (await p.isVisible(hintSel)) problems.push('hint came back after reload');
  await ctx.close();

  // 10e. Standalone (matchMedia override): never shown.
  ({ ctx, p } = await mk(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { ...orig(q), matches: true, media: q } : orig(q));
  }));
  if (await p.isVisible(hintSel)) problems.push('hint shown in standalone mode');
  await ctx.close();
}

// 11. Table file and creature cards: load through the menu, survive a reload, a bad file keeps the loaded one.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const openMenu = () => p.click('header.toolbar button[aria-label="Menu"]');
  const statusOf = async (which) => {
    await openMenu();
    const t = (await p.textContent(`.menu [data-status="${which}"] span`))?.trim();
    await p.keyboard.press('Escape');
    return t;
  };
  const fixtureRaw = readFileSync('tests/fixtures/dungeon-tables.fixture.json');
  // In-test copy only: a single-die armour with a long modifier, wider than any manoeuvre damage,
  // and conditions with 8 boxes each, as long as a real table file's.
  const fixtureObj = JSON.parse(fixtureRaw.toString());
  fixtureObj.tables.conditions.bloodied.boxes = 8;
  fixtureObj.tables.conditions.soaked.boxes = 8;
  JSON.stringify(fixtureObj, (k, v) => {
    if (v && v.name === 'Padded Tablecloth') Object.assign(v, { dice: [2], modifier: '-1 Damage' });
    return v;
  });
  const fixture = Buffer.from(JSON.stringify(fixtureObj));
  const fixtureName = JSON.parse(fixture.toString()).name;
  const pick = async (which, name, buffer) => {
    await p.setInputFiles(`input[data-extra="${which}"]`, { name, mimeType: 'application/json', buffer });
    await p.waitForTimeout(400);
  };

  await openMenu();
  const noTable = (await p.textContent('.menu [data-status="tables"] span'))?.trim();
  if (noTable !== 'No table file loaded') problems.push(`table status before load: "${noTable}"`);
  await p.keyboard.press('Escape');

  await pick('tables', 'tables.json', fixture);
  const afterLoad = await statusOf('tables');
  if (!afterLoad?.includes(fixtureName)) problems.push(`table status after load: "${afterLoad}"`);

  const onePx = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const packText = JSON.stringify({ format: 1, systemId: 'dungeon', name: 'Made-up cards', cards: [{ id: 'a', name: 'Goblin Thing', level: 1, image: onePx }] });
  await pick('cards', 'cards.json', Buffer.from(packText));
  const cardsStatus = await statusOf('cards');
  if (!cardsStatus?.includes('Made-up cards')) problems.push(`cards status after load: "${cardsStatus}"`);

  // The creation wizard, with the fixture tables loaded.
  const readSaved = () =>
    p.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('2d6-dungeon-companion', 1);
          r.onsuccess = () => {
            const g = r.result.transaction('saves').objectStore('saves').get('current');
            g.onsuccess = () => resolve(JSON.stringify(g.result ?? null));
            g.onerror = () => reject(g.error);
          };
          r.onerror = () => reject(r.error);
        }),
    );
  const wshot = async (name) => {
    await p.waitForTimeout(250);
    await p.screenshot({ path: join(outDir, name) });
    console.log(`Saved ${join(outDir, name)}`);
  };
  const wiz = (t) => p.click(`[role=dialog][aria-labelledby=wizard-title] button:text-is("${t}")`);
  const wizSmall = async () => {
    const n = await p.$$eval('[aria-labelledby=wizard-title] button, [aria-labelledby=wizard-title] input', (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length);
    if (n) problems.push(`wizard has ${n} controls under 44px`);
  };
  // Column x positions must match across rows, nothing may overflow the dialog.
  const wizAlign = async (where) => {
    const r = await p.evaluate(() => {
      const d = document.querySelector('[aria-labelledby=wizard-title]');
      const body = d.querySelector('.body');
      const xs = [...d.querySelectorAll('.mtable .row')].map((row) => [...row.querySelectorAll('.dcell, .dmg')].map((c) => Math.round(c.getBoundingClientRect().left)));
      const dr = d.getBoundingClientRect();
      const over = [...d.querySelectorAll('.mtable *, .weapons *')].filter((e) => e.getBoundingClientRect().right > dr.right + 1 || e.getBoundingClientRect().left < dr.left - 1).length;
      return { xs, over, hs: body.scrollWidth > body.clientWidth + 1, dr: [dr.width, dr.height] };
    });
    if (!r.xs.length) problems.push(`wizard ${where}: no table rows`);
    if (r.xs.some((x) => x.join() !== r.xs[0].join())) problems.push(`wizard ${where}: columns misaligned ${JSON.stringify(r.xs)}`);
    if (r.over || r.hs) problems.push(`wizard ${where}: overflow (${r.over} elements, hscroll ${r.hs})`);
  };
  // Review card: dice and last-column x match across manoeuvre + armour rows; nothing overflows or scrolls.
  const wizReview = async (where) => {
    const r = await p.evaluate(() => {
      const d = document.querySelector('[aria-labelledby=wizard-title]');
      const body = d.querySelector('.body');
      const xs = [...d.querySelectorAll('.sheet .mtable .row')].map((row) => [...row.querySelectorAll('.dcell, .dmg')].map((c) => Math.round(c.getBoundingClientRect().left)));
      const dr = d.getBoundingClientRect();
      const over = [...d.querySelectorAll('.sheet *')].filter((e) => e.getBoundingClientRect().right > dr.right + 1).length;
      return { xs, tables: d.querySelectorAll('.sheet .mtable').length, over, vs: body.scrollHeight > body.clientHeight + 1, hs: body.scrollWidth > body.clientWidth + 1, tiles: d.querySelectorAll('.tile').length };
    });
    if (r.tables !== 1 || r.tiles !== 4) problems.push(`wizard ${where}: expected 1 shared grid and 4 tiles, got ${r.tables}/${r.tiles}`);
    if (r.xs.length < 3) problems.push(`wizard ${where}: expected manoeuvre and armour rows in one grid`);
    if (r.xs.length < 2 || r.xs.some((x) => x.join() !== r.xs[0].join())) problems.push(`wizard ${where}: columns misaligned ${JSON.stringify(r.xs)}`);
    if (r.over || r.hs) problems.push(`wizard ${where}: overflow (${r.over} elements, hscroll ${r.hs})`);
    if (where.includes('1180') && r.vs) problems.push(`wizard ${where}: body scrolls vertically`);
  };
  const runWizard = async (name, shots) => {
    await openMenu();
    await p.click('[role=menuitem]:text-is("New game…")');
    await wiz('Next');
    await p.fill('[aria-labelledby=wizard-title] input[type=text]', name);
    await wiz('Next');
    // No weapon chosen: preview with disabled ticks, Next disabled.
    if (shots) await wshot('30-wizard-weapon.png');
    if (await p.isEnabled('.next')) problems.push('wizard Next enabled with no weapon chosen');
    if (!(await p.isDisabled('.mtable button.row'))) problems.push('wizard preview ticks not disabled');
    await wizAlign('weapon preview');
    await p.click('.weapon:has-text("Training Club")');
    await p.click('.mtable .row:has-text("Soft Bonk")');
    await p.click('.weapon:has-text("Practice Sword")');
    if (!(await p.isVisible('text=Your picks were cleared'))) problems.push('wizard switch-weapon notice missing');
    if (await p.locator('.mtable [aria-checked=true]').count()) problems.push('picks not cleared on weapon switch');
    if (await p.isEnabled('.next')) problems.push('wizard Next enabled with no manoeuvres chosen');
    await p.click('.mtable .row:has-text("Wobbly Poke")');
    await p.click('.mtable .row:has-text("Gentle Swipe")');
    if (!(await p.isVisible('text=Deselect one to choose another'))) problems.push('wizard limit hint missing');
    await wizAlign('weapon+manoeuvres');
    if (shots) await wshot('31-wizard-manoeuvres.png');
    await wizSmall();
    await wiz('Next');
    await p.click('.option:has-text("Padded Tablecloth")');
    await wiz('Next');
    await p.click('.option:has-text("Scroll of Mild Glow")');
    await wiz('Next');
    await wizReview('review 1180x820');
    if (shots) await wshot('32-wizard-review.png');
    await wiz('Begin');
    await p.waitForTimeout(300);
  };
  await runWizard('Pip Tester', true);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(800);
  if (!(await readSaved()).includes('Pip Tester')) problems.push('wizard hero not in the saved game');
  if (!(await statusOf('tables'))?.includes(fixtureName)) problems.push('table status lost after New game');
  if (!(await p.isDisabled('header.toolbar button.history'))) problems.push('Undo should be empty right after Begin');
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1000);
  if (!(await readSaved()).includes('Pip Tester')) problems.push('wizard hero lost after reload');

  // A hero-only game still asks before New game replaces it.
  await openMenu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Start without a hero');
  await p.waitForTimeout(300);
  if (!(await p.isVisible('text=This replaces your current game.'))) problems.push('hero-only game: replace confirmation not shown');
  await p.click('[role=alertdialog] button:text-is("Cancel")');
  if (!(await p.isVisible('[aria-labelledby=wizard-title]'))) problems.push('wizard closed after cancelling the replace confirmation');
  await wiz('Cancel');
  await p.waitForTimeout(300);

  // Cancel mid-wizard leaves the game alone.
  await openMenu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Next');
  await p.fill('[aria-labelledby=wizard-title] input[type=text]', 'Nobody');
  await wiz('Cancel');
  await p.waitForTimeout(500);
  const afterCancel = await readSaved();
  if (!afterCancel.includes('Pip Tester') || afterCancel.includes('Nobody')) problems.push('Cancel changed the game');

  // Portrait: the bigger wizard still fits and aligns.
  await p.setViewportSize({ width: 820, height: 1180 });
  await openMenu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Next');
  await p.fill('[aria-labelledby=wizard-title] input[type=text]', 'Narrow');
  await wiz('Next');
  await wizAlign('weapon preview (820x1180)');
  await p.click('.weapon:has-text("Training Club")');
  await p.click('.mtable .row:has-text("Soft Bonk")');
  await wizAlign('weapon+manoeuvres (820x1180)');
  await wizSmall();
  await p.click('.weapon:has-text("Practice Sword")');
  await p.click('.mtable .row:has-text("Wobbly Poke")');
  await p.click('.mtable .row:has-text("Gentle Swipe")');
  await wiz('Next');
  await p.click('.option:has-text("Padded Tablecloth")');
  await wiz('Next');
  await p.click('.option:has-text("Scroll of Mild Glow")');
  await wiz('Next');
  await wizReview('review 820x1180');
  await wizSmall();
  await wiz('Cancel');
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.waitForTimeout(300);

  // The Hero panel: quick strip, limits, level-up and the sheet tabs.
  const panel = '.hero-panel';
  const val = (label) => p.inputValue(`${panel} [aria-label="${label}"]`);
  const undoText = async () => (await p.textContent('header.toolbar button.history')) ?? '';
  const mapWidth = () => p.$eval('.map-view', (e) => Math.round(e.getBoundingClientRect().width));
  const canvasWidth = () => p.$eval('.map-view canvas', (e) => e.width);
  const widthBefore = await mapWidth();
  const canvasBefore = await canvasWidth();
  await p.click('header.toolbar button.hero');
  await p.waitForSelector(panel);
  await p.waitForTimeout(400);
  if ((await mapWidth()) >= widthBefore) problems.push('map did not narrow beside the hero panel');
  if ((await canvasWidth()) >= canvasBefore) problems.push('map canvas did not resize beside the hero panel');
  if (await p.isVisible('.panel[aria-label="Step panel"]')) problems.push('step panel still showing beside the hero panel');
  const hp0 = Number(await val('HP'));
  for (let i = 0; i < 3; i++) await p.click(`${panel} [aria-label="HP down"]`);
  if (Number(await val('HP')) !== hp0 - 3) problems.push('HP taps did not reduce HP by 3');
  if (!(await undoText()).includes('HP −3')) problems.push(`merged HP label: ${await undoText()}`);
  await p.click('header.toolbar button.history >> nth=0');
  if (Number(await val('HP')) !== hp0) problems.push('one undo did not restore all three HP taps');
  await p.click('header.toolbar button.history >> nth=1');
  if (Number(await val('HP')) !== hp0 - 3) problems.push('redo did not reapply the HP taps');
  await p.fill(`${panel} [aria-label="XP to add"]`, '50');
  await p.click(`${panel} button:text-is("Add XP")`);
  await p.click(`${panel} [aria-label="GC up"]`);
  await p.fill(`${panel} [aria-label="Add item"]`, 'Rope');
  await p.click(`${panel} button:text-is("Add")`);
  if (!(await p.isVisible(`${panel} .offer:has-text("Level up to Explorer?")`))) problems.push('level-up offer missing at 50 XP');
  await wshot('33-hero-strip.png');
  const smallHero = async (where) => {
    const n = await p.$$eval(`${panel} button, ${panel} input, ${panel} select`, (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length);
    if (n) problems.push(`hero ${where} has ${n} controls under 44px`);
    const over = await p.$eval(`${panel} .body`, (e) => e.scrollWidth > e.clientWidth + 1);
    if (over) problems.push(`hero ${where} scrolls sideways`);
  };
  await smallHero('strip');

  // Reload: the values persist.
  await p.waitForTimeout(800);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1000);
  if (!(await p.isVisible('header.toolbar button.hero:text-is("Hero")'))) problems.push('Hero button missing after reload');
  await p.click('header.toolbar button.hero');
  await p.waitForSelector(panel);
  if (Number(await val('HP')) !== hp0 - 3 || Number(await val('GC')) !== 1 || (await val('XP to add')) !== '' || !(await p.textContent(`${panel} .strip`))?.includes('50')) problems.push('quick-strip values lost after reload');

  // Limits warn but never block.
  const addLarge = async (t) => {
    await p.fill(`${panel} [aria-label="Add item"]`, t);
    await p.click(`${panel} .items button:text-is("Add")`);
  };
  await addLarge('Torch');
  if (await p.isVisible(`${panel} [role=alert]`)) problems.push('warning shown below the limit');
  await addLarge('Anvil');
  if (!(await p.isVisible(`${panel} [role=alert]:has-text("Your backpack holds 2 large items")`))) problems.push('limit warning missing');
  await wshot('37-hero-limit-warning.png');
  await p.click(`${panel} [role=alert] button:text-is("Cancel")`);
  await p.click(`${panel} #hero-tab-pack`);
  if ((await p.$$eval(`${panel} .slots li:not(.over) .grow:not(.empty)`, (e) => e.length)) !== 2) problems.push('Cancel did not leave the items alone');
  await p.fill(`${panel} [aria-label="New large item"]`, 'Anvil');
  await p.click(`${panel} .page form:has([aria-label="New large item"]) button:text-is("Add")`);
  await p.click(`${panel} [role=alert] button:text-is("Add anyway")`);
  if ((await p.$$eval(`${panel} .slots li`, (e) => e.length)) !== 3) problems.push('Add anyway did not add the item');
  {
    const w = (sel) => p.$eval(`${panel} ${sel}`, (e) => Math.round(e.getBoundingClientRect().width));
    const [large, small] = [await w('[aria-label="New large item"]'), await w('[aria-label="Small items: new entry"]')];
    if (Math.abs(large - small) > 1) problems.push(`small item box ${small}px wide, large item box ${large}px`);
    if (await p.isVisible(`${panel} [aria-label="Rations note"]`)) problems.push('rations note still showing');
  }
  await wshot('36-hero-items.png');
  await smallHero('items tab');

  // Level up, twice.
  if (!(await undoText()).includes('Add Anvil')) problems.push(`undo label after Add anyway: ${await undoText()}`);
  // Each opens the level-up step: new slots to fill and a swap, from the weapon up to the new max level.
  const step = `${panel} .level-up`;
  await p.click(`${panel} .offer button:text-is("Level up")`);
  if (!(await p.isVisible(`${step} [aria-label="Manoeuvres for the new slots"] .row:has-text("Cheerful Flourish")`))) problems.push('level-up step: level 2 manoeuvre not offered');
  if (await p.isVisible(`${step} .row:has-text("Grand Wave")`)) problems.push('level-up step: level 3 manoeuvre offered at level 2');
  await p.click(`${step} [aria-label="Manoeuvre to swap out"] .row:has-text("Wobbly Poke")`);
  if (!(await p.isDisabled(`${step} button:text-is("Level up")`))) problems.push('level-up step: a half-made swap does not hold the level up');
  await wshot('37b-level-up-step.png');
  await smallHero('level-up step');
  await p.click(`${step} [aria-label="Manoeuvre to swap out"] .row:has-text("Wobbly Poke")`);
  await p.click(`${step} button:text-is("Level up")`);
  if (!(await undoText()).includes('Level up to Explorer')) problems.push(`level-up label: ${await undoText()}`);
  if (!(await p.isVisible(`${panel} .offer:has-text("Level up to Seasoned Snoozer?")`))) problems.push('second level-up offer missing');
  await p.click(`${panel} .offer button:text-is("Level up")`);
  await p.click(`${step} button:text-is("Level up")`);
  if (await p.isVisible(`${panel} .offer, ${step}`)) problems.push('level-up offer still showing at the top level');

  // Combat page: manoeuvres offered from the loaded table file.
  await p.click(`${panel} #hero-tab-combat`);
  if (!(await p.isVisible(`${panel} button[aria-label="Add Grand Wave"]`))) problems.push('weapon manoeuvres not offered');
  await p.click(`${panel} button[aria-label="Add Cheerful Flourish"]`);
  if (await p.isVisible(`${panel} [role=alert]`)) problems.push('warning shown within the manoeuvre limit');
  await wshot('34-hero-stats.png');
  // Dice are pip faces labelled for assistive tech; the columns line up across rows.
  {
    const labels = await p.$$eval(`${panel} .drow .die[role=img]`, (els) => els.map((e) => e.getAttribute('aria-label')));
    if (!labels.length || labels.some((l) => !/^(red|blue) [1-6]$/.test(l ?? ''))) problems.push(`die labels: ${JSON.stringify(labels)}`);
    const pips = await p.$$eval(`${panel} .drow .die[role=img]`, (els) => els.every((e) => e.querySelectorAll('circle').length === Number(e.getAttribute('aria-label').split(' ')[1])));
    if (!pips) problems.push('pip count does not match die label');
    const xs = await p.$$eval(`${panel} ul .drow`, (rows) => rows.filter((r) => r.querySelector('.mod')).map((r) => Math.round(r.querySelector('.mod').getBoundingClientRect().x)));
    if (new Set(xs).size > 2) problems.push(`damage column not aligned: ${xs}`);
    await p.screenshot({ path: join(outDir, '41-dice-pips.png') });
    // Buttons and modifiers never spill or wrap, at this width and at a 420px panel.
    const fit = async (where) => {
      const bad = await p.$$eval(`${panel} .drow`, (rows) =>
        rows.flatMap((r) => [...r.querySelectorAll('button, .mod')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > r.getBoundingClientRect().right + 1 || e.getBoundingClientRect().height > 60).map((e) => e.textContent.trim())),
      );
      if (bad.length) problems.push(`sheet grid ${where}: ${bad.join(', ')} spill or wrap`);
      const rights = await p.$$eval(`${panel} .dgrid`, (gs) => gs.map((g) => new Set([...g.querySelectorAll('.drow:not(.dhead) .mod')].map((e) => Math.round(e.getBoundingClientRect().x))).size));
      if (rights.some((n) => n > 1)) problems.push(`sheet grid ${where}: modifier column misaligned ${JSON.stringify(await p.$$eval(`${panel} .dgrid .drow .mod`, (es) => es.map((e) => e.getBoundingClientRect().x)))}`);
      if (await p.$eval(panel, (e) => e.scrollWidth > e.clientWidth + 1)) problems.push(`sheet grid ${where}: panel scrolls sideways`);
    };
    await fit('at 1180');
    const origW = await p.$eval(panel, (e) => e.getBoundingClientRect().width);
    await p.$eval(panel, (e) => { e.style.setProperty('width', '420px', 'important'); e.style.setProperty('flex', 'none', 'important'); });
    await p.waitForTimeout(200);
    await fit('at 420');
    await p.$eval(`${panel} .dgrid`, (e) => e.scrollIntoView({ block: 'center' }));
    await p.screenshot({ path: join(outDir, '41b-dice-pips-narrow.png') });
    await p.$eval(panel, (e) => { e.style.removeProperty('width'); e.style.removeProperty('flex'); });
    await p.waitForTimeout(200);
    void origW;
    // All six faces, red and blue, rendered in the app's own component styles.
    await p.evaluate(() => {
      const donor = document.querySelector('.hero-panel .drow .die[role=img]');
      const box = document.createElement('div');
      box.id = 'all-faces';
      box.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;background:#fff;padding:16px;display:grid;gap:10px';
      for (const colour of ['red', 'blue']) {
        const line = document.createElement('div');
        line.style.cssText = 'display:flex;gap:14px';
        box.append(line);
        for (let n = 1; n <= 6; n++) {
          const d = donor.cloneNode(true);
          d.className = donor.className.replace(/\b(red|blue)\b/, colour);
          d.setAttribute('aria-label', `${colour} ${n}`);
          const pos = { 1: [[15, 15]], 2: [[22, 8], [8, 22]], 3: [[22, 8], [15, 15], [8, 22]], 4: [[8, 8], [22, 8], [8, 22], [22, 22]], 5: [[8, 8], [22, 8], [15, 15], [8, 22], [22, 22]], 6: [[8, 8], [22, 8], [8, 15], [22, 15], [8, 22], [22, 22]] }[n];
          const svg = d.querySelector('svg');
          const tmpl = svg.querySelector('circle');
          svg.replaceChildren(...pos.map(([x, y]) => { const c = tmpl.cloneNode(); c.setAttribute('cx', x); c.setAttribute('cy', y); return c; }));
          d.style.transform = 'scale(2)';
          d.style.margin = '18px';
          line.append(d);
        }
      }
      document.body.append(box);
    });
    await p.screenshot({ path: join(outDir, '42-die-faces.png'), clip: { x: 0, y: 0, width: 640, height: 220 } });
    await p.evaluate(() => document.getElementById('all-faces')?.remove());
  }
  await smallHero('combat tab');
  // Identity fields are editable by hand: one commit each, no automatic stat changes.
  await p.click(`${panel} #hero-tab-hero`);
  {
    const shiftSel = `${panel} label:has(.cap:text-is("shift")) input`;
    const shiftBefore = await p.inputValue(shiftSel);
    await p.fill(`${panel} [aria-label="Hero title"]`, 'Hand-typed Title');
    await p.press(`${panel} [aria-label="Hero title"]`, 'Tab');
    if (!(await undoText()).includes('Edit hero')) problems.push(`typed title label: ${await undoText()}`);
    await p.fill(`${panel} [aria-label="HP baseline"]`, '21');
    await p.press(`${panel} [aria-label="HP baseline"]`, 'Tab');
    await p.fill(`${panel} [aria-label="Hero level"]`, '0');
    await p.press(`${panel} [aria-label="Hero level"]`, 'Tab');
    if ((await val('Hero level')) !== '3') problems.push('level 0 was accepted');
    if (await p.isVisible(`${panel} .error`)) problems.push('level 0 showed an error');
    if ((await val('HP baseline')) !== '21') problems.push('typed HP baseline lost');
    if ((await p.inputValue(shiftSel)) !== shiftBefore) problems.push('editing the sheet changed a stat');
    await p.fill(`${panel} [aria-label="Hero title"]`, 'Seasoned Snoozer');
    await p.press(`${panel} [aria-label="Hero title"]`, 'Tab');
    await p.fill(`${panel} [aria-label="HP baseline"]`, '17');
    await p.press(`${panel} [aria-label="HP baseline"]`, 'Tab');
  }

  await p.click(`${panel} button[aria-label="Scraped Up box 2"]`);
  await p.click(`${panel} button[aria-label="Old Mossbeard favour box 3"]`);
  // Conditions and Favour: each name sits above its boxes, every row of boxes starts on one line, and at full width none wraps.
  const tracksAligned = async (where) => {
    const xs = await p.$$eval(`${panel} [data-testid=conditions] .boxes, ${panel} [data-testid=favour] .boxes`, (gs) => gs.map((g) => Math.round(g.getBoundingClientRect().x)));
    if (xs.length < 3 || new Set(xs).size !== 1) problems.push(`condition and favour boxes ${where} not lined up: ${xs}`);
    const wrapped = await p.$$eval(`${panel} [data-testid=conditions] .boxes, ${panel} [data-testid=favour] .boxes`, (gs) => gs.filter((g) => new Set([...g.children].map((b) => Math.round(b.getBoundingClientRect().y))).size > 1).length);
    // At 420 the panel is too narrow for 8 boxes of 44px, so they may wrap there.
    if (wrapped && where === 'wide') problems.push(`${wrapped} condition or favour trackers ${where} wrap onto a second line`);
    const fx = await p.$$eval(`${panel} [data-testid=conditions] .effect`, (es) => es.map((e) => Math.round(e.getBoundingClientRect().x)));
    if (new Set(fx).size !== 1) problems.push(`condition effects ${where} not lined up: ${fx}`);
    if (await p.$eval(panel, (e) => e.scrollWidth > e.clientWidth + 1)) problems.push(`hero tab ${where}: panel scrolls sideways`);
  };
  await tracksAligned('wide');
  await wshot('35-hero-conditions.png');
  await p.$eval(panel, (e) => { e.style.setProperty('width', '420px', 'important'); e.style.setProperty('flex', 'none', 'important'); });
  await p.waitForTimeout(200);
  await tracksAligned('at 420');
  await p.$eval(`${panel} [data-testid=favour]`, (e) => e.scrollIntoView({ block: 'center' }));
  await p.screenshot({ path: join(outDir, '35b-hero-conditions-narrow.png') });
  await p.$eval(panel, (e) => { e.style.removeProperty('width'); e.style.removeProperty('flex'); });
  await p.waitForTimeout(200);
  await smallHero('hero tab');
  await p.click(`${panel} #hero-tab-journal`);
  await p.fill(`${panel} textarea[aria-label="Narrative"]`, 'Found a very small door.');
  await p.click(`${panel} #hero-tab-pack`);
  await p.waitForTimeout(1500);
  const savedHero = await readSaved();

  for (const want of ['Found a very small door.', 'Seasoned Snoozer']) if (!savedHero.includes(want)) problems.push(`hero sheet edit not in the saved game: ${want}`);

  // Close restores the step panel; without a table file the picker says so.
  await p.click(`${panel} button[aria-label="Close hero panel"]`);
  if (!(await p.isVisible('.panel[aria-label="Step panel"]'))) problems.push('closing the hero panel did not restore the step panel');

  // Encounter: a made-up 3-card pack with canvas-drawn placeholder images.
  {
    const imgs = await p.evaluate(() =>
      [['#c96', 'A'], ['#6a9', 'B'], ['#69c', 'C']].map(([bg, ch]) => {
        // A real card's size (700 × 968), so a full-screen card that does not fit the screen shows up.
        const c = document.createElement('canvas');
        c.width = 700;
        c.height = 968;
        const g = c.getContext('2d');
        g.scale(700 / 300, 968 / 420);
        g.fillStyle = bg;
        g.fillRect(0, 0, 300, 420);
        g.strokeStyle = '#222';
        g.lineWidth = 8;
        g.strokeRect(8, 8, 284, 404);
        g.fillStyle = '#222';
        g.font = '160px sans-serif';
        g.textAlign = 'center';
        g.fillText(ch, 150, 260);
        return c.toDataURL('image/png');
      }),
    );
    const pack = { format: 1, systemId: 'dungeon', name: 'Made-up cards', cards: [
      { id: 'g1', name: 'Mossy Gribbler', level: 1, image: imgs[0] },
      { id: 'g2', name: 'Cellar Hum', level: 2, image: imgs[1] },
      { id: 'g3', name: 'Tall Pennywort', level: 2, image: imgs[2] },
    ] };
    await pick('cards', 'cards3.json', Buffer.from(JSON.stringify(pack)));
    await p.click('header.toolbar button.encounter');
    await p.waitForSelector('.encounter-pane');
    await p.click('.encounter-pane button:text-is("Add creature")');
    await p.waitForSelector('.encounter-picker');
    // Three cards plus the fixture's three table creatures (which have no cards).
    const picks = () => p.$$eval('.encounter-picker .pick:not(.add)', (e) => e.length);
    if ((await picks()) !== 6) problems.push(`picker listed ${await picks()} creatures, not 6`);
    const opts = await p.$$eval('.encounter-picker select option', (e) => e.map((o) => o.textContent.trim()));
    if (opts.join('|') !== 'All|Level 1|Level 2') problems.push('level filter options: ' + opts.join('|'));
    await p.selectOption('.encounter-picker select', '2');
    if ((await picks()) !== 3) problems.push('level filter did not narrow');
    await p.fill('.encounter-picker input[type=search]', 'penny');
    if ((await picks()) !== 1) problems.push('name search did not narrow');
    const histBefore = await undoText();
    await p.click('.encounter-picker .pick:not(.add)');
    // A card with no stats in the table file asks for its starting HP.
    await p.waitForSelector('.encounter-pane form.ask');
    if (!(await p.textContent('.encounter-pane form.ask label'))?.includes('Starting HP for Tall Pennywort')) problems.push('starting HP prompt text');
    if ((await undoText()) !== histBefore) problems.push('picking a no-stats card changed History before its HP was given');
    await p.fill('.encounter-pane form.ask input', '5');
    await p.click('.encounter-pane form.ask button:text-is("Add")');
    await p.waitForSelector('.encounter-pane .thumb img');
    if (await p.isVisible('.panel[aria-label="Step panel"]')) problems.push('step panel showing beside the encounter pane');
    const fit = await p.$eval('.encounter-pane .thumb img', (e) => e.getBoundingClientRect().width <= e.closest('.encounter-pane').getBoundingClientRect().width);
    if (!fit) problems.push('card image wider than the panel');
    if (!(await undoText()).includes('Start encounter')) problems.push(`adding a creature: undo reads "${await undoText()}"`);
    await wshot('38-encounter.png');
    // Hero open too: tabs, Encounter first.
    await p.click('header.toolbar button.hero');
    await p.waitForSelector('.hero-panel');
    if (!(await p.isVisible('#side-tab-encounter')) || !(await p.isVisible('#side-tab-hero'))) problems.push('tabs missing with both open');
    await p.click('#side-tab-encounter');
    if (!(await p.isVisible('.encounter-pane'))) problems.push('Encounter tab did not show the pane');
    await p.click('#side-tab-hero');
    if (!(await p.isVisible('.hero-panel')) || (await p.isVisible('.encounter-pane'))) problems.push('Hero tab did not switch');
    await wshot('39-encounter-hero-tabs.png');
    await p.click('#side-tab-encounter');
    // Full screen closes on tap and on Escape.
    await p.click('.encounter-pane .thumb');
    if (!(await p.isVisible('.full img'))) problems.push('full-screen card missing');
    const fullFits = await p.$eval('.full img', (e) => {
      const r = e.getBoundingClientRect();
      return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    });
    if (!fullFits) problems.push('full-screen card runs off the screen');
    await p.click('.full');
    if (await p.isVisible('.full')) problems.push('full-screen card did not close on tap');
    await p.click('.encounter-pane .thumb');
    await p.keyboard.press('Escape');
    if (await p.isVisible('.full')) problems.push('full-screen card did not close on Escape');
    // A creature still standing: End encounter asks first.
    await p.click('.encounter-pane button:text-is("End encounter")');
    if (!(await p.isVisible('.encounter-pane .confirm >> text=Creatures are still standing. End the encounter anyway?'))) problems.push('End encounter did not ask while a creature stands');
    await p.click('.encounter-pane .confirm button:text-is("End encounter")');
    await p.waitForTimeout(200);
    if (await p.isVisible('.encounter-pane') || !(await p.isVisible('.hero-panel'))) problems.push('End encounter did not leave the hero panel');
    if (!(await undoText()).includes('End encounter')) problems.push(`End encounter: undo reads "${await undoText()}"`);
    await p.click(`${panel} button[aria-label="Close hero panel"]`);
    if (!(await p.isVisible('.panel[aria-label="Step panel"]'))) problems.push('step panel did not return');
    // Mid-placement: opening Encounter keeps the step panel reachable as a Room tab.
    {
      const at = await p.$eval('canvas', (c) => {
        const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
        const r = c.getBoundingClientRect();
        return { cx, cy, sc, left: r.left, top: r.top, h: r.height };
      });
      // The row of entrance squares sits just above the bottom of the canvas.
      await p.mouse.click(at.left + 120, at.top + at.h - 30);
      await p.waitForTimeout(200);
      if ((await p.getAttribute('aside.panel .body', 'data-step')) === 'idle') problems.push('entrance tap did not start a flow step');
      await p.click('header.toolbar button.encounter');
      await p.waitForSelector('#side-tab-room');
      if (await p.isVisible('aside.panel .body')) problems.push('step panel visible while the Encounter tab is selected');
      await p.click('#side-tab-room');
      await p.waitForSelector('aside.panel .body[data-step]');
      await wshot('40-encounter-room-tab.png');
      await p.click('aside.panel button:text-is("Cancel")');
      await p.waitForTimeout(300);
      if (await p.isVisible('#side-tab-room')) problems.push('Room tab still showing after the flow ended');
      if (!(await p.isVisible('.encounter-pane'))) problems.push('encounter pane not left open after the flow ended');
      await p.click('.encounter-pane button[aria-label="Close encounter"]');
    }
  }

  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1000);
  const afterReload = await statusOf('tables');
  if (!afterReload?.includes(fixtureName)) problems.push(`table status after reload: "${afterReload}"`);
  if (!(await statusOf('cards'))?.includes('Made-up cards')) problems.push('cards status after reload lost the pack');
  await openMenu();
  await p.screenshot({ path: join(outDir, '25-menu-files.png') });
  const small = await p.$$eval('.menu button', (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length);
  if (small) problems.push('menu buttons are under 44px');
  await p.keyboard.press('Escape');

  // A corrupt table file: message shown, status unchanged.
  await pick('tables', 'bad.json', Buffer.from('{ not json'));
  if (!(await p.isVisible("text=This isn't a 2D6 Dungeon table file"))) problems.push('corrupt table file: message not shown');
  await p.screenshot({ path: join(outDir, '26-bad-table-file.png') });
  await p.click('[role=alertdialog] button:text-is("OK")');
  const afterBad = await statusOf('tables');
  if (!afterBad?.includes(fixtureName)) problems.push(`table status changed after a bad file: "${afterBad}"`);

  // Remove clears it, and stays cleared after a reload.
  await openMenu();
  await p.click('.menu [data-status="tables"] button:text-is("Remove")');
  await p.keyboard.press('Escape');
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1000);
  if ((await statusOf('tables')) !== 'No table file loaded') problems.push('table file came back after Remove and reload');
  await p.click('header.toolbar button.hero');
  await p.waitForSelector('.hero-panel');
  await p.click('.hero-panel #hero-tab-combat');
  if (!(await p.isVisible('.hero-panel >> text=Load your table file to choose manoeuvres'))) problems.push('no-tables manoeuvre hint missing');

  // Typed text, then the app is backgrounded without any blur: the text is kept.
  await p.click('.hero-panel #hero-tab-journal');
  await p.fill('.hero-panel textarea[aria-label="Narrative"]', 'typed, then the app was backgrounded');
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(1200);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1000);
  await p.click('header.toolbar button.hero');
  await p.waitForSelector('.hero-panel');
  await p.click('.hero-panel #hero-tab-journal');
  if ((await p.inputValue('.hero-panel textarea[aria-label="Narrative"]')) !== 'typed, then the app was backgrounded') problems.push('typed narrative lost when the app was backgrounded');

  // Typed text with no blur, then another edit, then a tab switch: both survive.
  await p.click('.hero-panel #hero-tab-journal');
  await p.fill('.hero-panel textarea[aria-label="Narrative"]', 'typed before an HP tap');
  const hpNow = Number(await val('HP'));
  await p.evaluate(() => document.querySelector('.hero-panel [aria-label="HP down"]').click());
  await p.evaluate(() => document.querySelector('.hero-panel #hero-tab-pack').click());
  await p.waitForTimeout(1500);
  const rebased = await readSaved();
  if (!rebased.includes('typed before an HP tap')) problems.push('typed narrative lost after another edit');
  if (Number(await val('HP')) !== hpNow - 1) problems.push('HP tap lost when rebasing typed text');

  // Teardown with typed text: New game without a hero while the Loot & Story tab is open must not crash.
  const errorsBefore = errors.length;
  await p.click('.hero-panel #hero-tab-journal');
  await p.fill('.hero-panel textarea[aria-label="Narrative"]', 'typed, then the game goes away');
  await openMenu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Start without a hero');
  await p.waitForTimeout(300);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(500);
  if (!(await p.isVisible('.panel[aria-label="Step panel"]'))) problems.push('step panel missing after the hero went away on the Loot & Story tab');
  if (await p.isVisible('.hero-panel')) problems.push('hero panel still showing with no hero');
  if (errors.length !== errorsBefore) problems.push('page error when the hero went away: ' + errors.slice(errorsBefore).join(' | '));

  // No hero and no table file: Hero explains what to do instead of opening a dead-end wizard.
  await p.click('header.toolbar button.hero');
  await p.waitForTimeout(300);
  if (!(await p.isVisible('.toast:has-text("Load your table file first")'))) problems.push('Hero with no table file: toast missing');
  if (await p.isVisible('[aria-labelledby=wizard-title]')) problems.push('Hero with no table file opened the wizard');
  await ctx.close();
}

// 12. Animated dice rolls: faces cycle, then land; the result step shows pip faces; the sound toggle persists.
for (const reduced of [false, true]) {
  const tag = reduced ? 'roll (reduced motion)' : 'roll';
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tap = async (x, y) => {
    const at = await p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(150);
  };
  const btn = (name) => p.click(`aside.panel button:text-is("${name}")`);
  const stepNow = () => p.getAttribute('aside.panel .body', 'data-step');
  const waitStep = (want) => p.waitForFunction((w) => document.querySelector('aside.panel .body')?.getAttribute('data-step') === w, want, { timeout: 5000 }).then(() => true, () => false);
  await tap(12.5, 25.5);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await btn('Done');
  await btn('Done');
  await p.waitForTimeout(1500);
  await tap(12.5, 20);
  // Roll until the result is a position step (doubles ask for another roll first).
  let guard = 0;
  let sampled = new Set();
  while ((await stepNow()) === 'size' && guard++ < 6) {
    const label = `${rollerPanel} [data-testid=dice-result] [role=img]`;
    await rollerEnterModeOn(p, false);
    await p.click('aside.panel [data-testid=roll-card] button');
    if (await p.locator(`${rollerPanel} button.roll:disabled`).count() < 1) problems.push(`${tag}: roller Roll button not disabled while rolling`);
    if (!reduced && guard === 1) {
      for (let i = 0; i < 8; i++) {
        await p.waitForTimeout(70);
        const l = await p.getAttribute(label, 'aria-label').catch(() => null);
        if (l) sampled.add(l);
        if (i === 3) await shot('44-rolling.png', p);
      }
      if (sampled.size < 2) problems.push(`${tag}: die face did not change during the first ~600 ms (${[...sampled].join(', ')})`);
    }
    await waitStep('position').then((ok) => ok || p.waitForTimeout(1800));
  }
  if (!(await waitStep('position'))) problems.push(`${tag}: never reached the position step`);
  else {
    const text = (await p.textContent('[data-testid=rolled]'))?.replace(/\s+/g, ' ').trim() ?? '';
    const faces = await p.$$eval('[data-testid=roll-faces] [role=img]', (els) => els.map((e) => e.getAttribute('aria-label')));
    console.log(`${tag}: "${text}" faces ${faces.join(', ')}`);
    const m = text.match(/(\d+) × (\d+)/);
    if (!m) problems.push(`${tag}: result text missing: "${text}"`);
    if (faces.length < 2 || faces.length % 2 !== 0) problems.push(`${tag}: expected equal red and blue face counts, got ${faces.length}`);
    else {
      if (!faces.every((f, i) => f.startsWith(i < faces.length / 2 ? 'red ' : 'blue '))) problems.push(`${tag}: face colours wrong: ${faces.join(', ')}`);
      const sum = (c) => faces.filter((f) => f.startsWith(c)).reduce((a, f) => a + Number(f.split(' ')[1]), 0);
      if (m && (sum('red') !== Number(m[1]) || sum('blue') !== Number(m[2]))) problems.push(`${tag}: faces ${faces.join(', ')} do not add up to ${m[1]} × ${m[2]}`);
    }
    if (!reduced) await shot('43-roll-result.png', p);
  }
  // Exit count roll: place, then roll the exit D6 and expect it to advance.
  if ((await stepNow()) === 'position') {
    if (await p.isDisabled('aside.panel button:text-is("Place")')) await btn('Shrink to fit').catch(() => {});
    await btn('Place');
    if (await waitStep('exitCount')) {
      await rollerEnterModeOn(p, false);
      await p.click('aside.panel [data-testid=roll-card] button');
      const left = await p.waitForFunction(() => document.querySelector('aside.panel .body')?.getAttribute('data-step') !== 'exitCount', null, { timeout: 5000 }).then(() => true, () => false);
      if (!left) problems.push(`${tag}: exit count roll never advanced`);
    } else problems.push(`${tag}: no exit count step after placing`);
  }
  // Sound toggle: present, on by default, remembers off across a reload.
  if (!reduced) {
    const menu = () => p.click('header.toolbar button[aria-label="Menu"]');
    await menu();
    const box = p.locator('.menu label:has-text("Sound effects") input');
    if (!(await box.isChecked())) problems.push('sound effects not on by default');
    await box.uncheck();
    await p.keyboard.press('Escape');
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(800);
    await menu();
    if (await p.locator('.menu label:has-text("Sound effects") input').isChecked()) problems.push('sound toggle did not remember off after reload');
  }
  await ctx.close();
}

// 13. The Room step: with the fixture tables loaded the exit type step is skipped and the label step rolls.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'room roll';
  const tap = async (x, y) => {
    const at = await p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(150);
  };
  const btn = (name) => p.click(`aside.panel button:text-is("${name}")`);
  const stepNow = () => p.getAttribute('aside.panel .body', 'data-step');
  const fixtureObj2 = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json').toString());
  const load = async (obj) => {
    await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
    await p.waitForTimeout(500);
  };
  const undo = async () => (await p.textContent('header.toolbar button.history'))?.replace(/\s+/g, ' ').trim() ?? '';
  await load(fixtureObj2);
  await tap(12.5, 25.5);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await btn('Done');
  await btn('Done');
  await p.waitForTimeout(1500);
  const roomUndo0 = await undo();
  await tap(12.5, 20);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await rollerEnterOn(p, '4');
  if ((await stepNow()) !== 'exits') problems.push(`${tag}: expected the exits step (no exit type step), got ${await stepNow()}`);
  await rollerEnterOn(p, '3');
  await btn('Done');
  if ((await stepNow()) !== 'label') problems.push(`${tag}: expected the label step, got ${await stepNow()}`);
  await rollerEnterOn(p, '3', '4');
  const resultText = (await p.textContent('[data-testid=room-result]'))?.replace(/\s+/g, ' ').trim() ?? '';
  console.log(`${tag}: "${resultText}"`);
  if (!resultText.includes('Practice Room 34')) problems.push(`${tag}: result missing the room type: "${resultText}"`);
  if (!/Wooden/i.test(resultText) || !/locked/.test(resultText)) problems.push(`${tag}: result missing the exit: "${resultText}"`);
  const faces = await p.$$eval('[data-testid=room-result] [role=img]', (els) => els.map((e) => e.getAttribute('aria-label')));
  if (faces.join() !== 'red 3,blue 4') problems.push(`${tag}: result faces ${faces.join()}`);
  await checkPanelOn(p, tag);
  await shot('45-room-roll.png', p);
  // Picking another tool mid-placement must not drop the room.
  for (const name of ['Door', 'Stairs', 'Note']) {
    if (!(await p.isDisabled(`header.toolbar button.tool:text-is("${name}")`))) problems.push(`${tag}: ${name} tool not disabled while placing a room`);
  }
  if (await p.isDisabled('header.toolbar button.tool:text-is("Play")')) problems.push(`${tag}: Play disabled while placing`);
  if ((await stepNow()) !== 'label') problems.push(`${tag}: room no longer being placed (step ${await stepNow()})`);
  await btn('Done');
  await p.waitForTimeout(1500);
  if (await p.isVisible('text=/Autosave isn.t working/')) problems.push(`${tag}: autosave banner after the room roll`);
  const after = await undo();
  if (!after.includes('Add Room 2')) problems.push(`${tag}: undo label "${after}"`);
  await shot('46-room-rolled.png', p);
  await p.click('header.toolbar button.history');
  await p.waitForTimeout(300);
  if ((await undo()) !== roomUndo0) problems.push(`${tag}: one undo did not remove the whole room (now "${await undo()}", was "${roomUndo0}")`);

  // A level the table file has no tables for: the message, Skip, then the manual form with an exit type chooser.
  const bare = structuredClone(fixtureObj2);
  delete bare.tables.dungeonLevels;
  await load(bare);
  await tap(12.5, 20);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await rollerEnterOn(p, '4');
  if ((await stepNow()) !== 'exitType') problems.push(`${tag}: no-level table file should keep the exit type step, got ${await stepNow()}`);
  await p.click('aside.panel button:has-text("Wooden door")');
  await rollerEnterOn(p, '3');
  await btn('Done');
  if (!(await p.isVisible('[data-testid=no-level-tables]'))) problems.push(`${tag}: no-level message missing`);
  await shot('47-no-level-tables.png', p);
  await btn('Skip');
  if (!(await p.isVisible('aside.panel input[placeholder="e.g. Lamp Room"]'))) problems.push(`${tag}: Skip did not show the manual label form`);
  await checkPanelOn(p, `${tag} (skipped)`);
  await ctx.close();
}

// 14. Roll later: skip a room's roll, then roll for it from the room inspector (a tap in Play).
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'roll later';
  const tap = async (x, y) => {
    const at = await p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(150);
  };
  const btn = (name) => p.click(`aside.panel button:text-is("${name}")`);
  const tool = (name) => p.click(`header.toolbar button.tool:text-is("${name}")`);
  const undo = async () => (await p.textContent('header.toolbar button.history'))?.replace(/\s+/g, ' ').trim() ?? '';
  const doorNow = async (x, y) => {
    await tool('Door');
    await tap(x, y);
    const pressed = await p.$$eval('aside.panel [data-editor=door] button[aria-pressed=true]', (els) => els.map((e) => e.textContent?.trim()));
    await tool('Play');
    return pressed.join('+');
  };
  await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(readFileSync('tests/fixtures/dungeon-tables.fixture.json')) });
  await p.waitForTimeout(500);
  await tap(12.5, 25.5);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await btn('Done');
  await btn('Done');
  await p.waitForTimeout(1500);
  await tap(12.5, 20);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await rollerEnterOn(p, '4');
  await rollerEnterOn(p, '3');
  await btn('Done');
  await btn('Skip'); // skip the roll
  await btn('Skip'); // and leave the room unlabelled
  await p.waitForTimeout(1500);
  const level = (await p.textContent('[data-testid=level-indicator]'))?.trim();
  if (level !== 'Level 1 · Test Halls') problems.push(`${tag}: level indicator is "${level}"`);
  await tool('Play');
  const roomAt = [12.5, 18.5];
  const entry = [12.5, 20.5];
  const exitE = [14, 17.5];
  const exitN = [12.5, 16];
  const before = [await doorNow(...entry), await doorNow(...exitE), await doorNow(...exitN)];
  await tap(...roomAt);
  if (!(await p.isVisible('aside.panel button:text-is("Roll for this room")'))) problems.push(`${tag}: no "Roll for this room" button`);
  await shot('48a-roll-later-button.png', p);
  await btn('Roll for this room');
  await rollerEnterOn(p, '3', '4');
  const result = (await p.textContent('[data-testid=room-result]'))?.replace(/\s+/g, ' ').trim() ?? '';
  console.log(`${tag}: "${result}"`);
  if (!result.includes('Practice Room 34') || !/Wooden/i.test(result) || !/locked/.test(result)) problems.push(`${tag}: bad result "${result}"`);
  await btn('Apply');
  await p.waitForTimeout(2500);
  if (await p.isVisible('text=/Autosave isn.t working/')) problems.push(`${tag}: autosave banner after Apply`);
  if (!(await undo()).includes('Roll room 2')) problems.push(`${tag}: undo label "${await undo()}"`);
  const after = [await doorNow(...entry), await doorNow(...exitE), await doorNow(...exitN)];
  console.log(`${tag}: doors before ${before.join(' | ')}; after ${after.join(' | ')}`);
  if (after[0] !== before[0]) problems.push(`${tag}: entry door changed (${before[0]} -> ${after[0]})`);
  for (const i of [1, 2]) if (!after[i].includes('Wooden door')) problems.push(`${tag}: exit ${i} is "${after[i]}", expected Wooden door`);
  await tap(...roomAt);
  const insp = (await p.innerText('aside.panel [data-editor="room"]')).replace(/\s+/g, ' ').trim();
  console.log(`${tag}: inspector "${insp}"`);
  if (!insp.includes('Nothing but invented dust (34).')) problems.push(`${tag}: inspector missing the encounter text`);
  // A rolled room's type and unique flag are the table's: shown, not editable. The narrative still is.
  if (!insp.includes('Practice Room 34')) problems.push(`${tag}: inspector missing the rolled room type`);
  if (await p.isVisible('aside.panel [data-editor="room"] input[type="text"]')) problems.push(`${tag}: rolled room type still editable`);
  if (await p.isVisible('aside.panel [data-editor="room"] input[type="checkbox"]')) problems.push(`${tag}: rolled room unique flag still editable`);
  if (!(await p.isVisible('aside.panel [data-editor="room"] textarea'))) problems.push(`${tag}: rolled room narrative not editable`);
  if (await p.isVisible('aside.panel button:text-is("Roll for this room")')) problems.push(`${tag}: roll button still shown after rolling`);
  await checkPanelOn(p, tag);
  await shot('48-roll-later.png', p);
  // One undo takes the whole roll back.
  await p.click('header.toolbar button.history');
  await p.waitForTimeout(300);
  if (!(await p.isVisible('aside.panel button:text-is("Roll for this room")'))) problems.push(`${tag}: undo did not remove the roll`);
  if ((await doorNow(...exitE)) !== before[1]) problems.push(`${tag}: undo did not restore the exit type`);
  await ctx.close();
}

// 15. Going down a level: stairs down, the ration rule, the new level, reload, the read-only viewer, export.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'go down';
  const tap = async (x, y) => {
    const at = await p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(150);
  };
  const btn = (name) => p.click(`aside.panel button:text-is("${name}")`);
  const wiz = (t) => p.click(`[role=dialog][aria-labelledby=wizard-title] button:text-is("${t}")`);
  const menu = () => p.click('header.toolbar button[aria-label="Menu"]');
  const banner = async (where) => {
    if (await p.isVisible('text=/Autosave isn.t working/')) problems.push(`${tag}: autosave banner ${where}`);
  };
  const saved = () =>
    p.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('2d6-dungeon-companion', 1);
          r.onsuccess = () => {
            const g = r.result.transaction('saves').objectStore('saves').get('current');
            g.onsuccess = () => resolve(g.result ?? null);
            g.onerror = () => reject(g.error);
          };
          r.onerror = () => reject(r.error);
        }),
    );
  await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(readFileSync('tests/fixtures/dungeon-tables.fixture.json')) });
  await p.waitForTimeout(500);
  await menu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Next');
  await p.fill('[aria-labelledby=wizard-title] input[type=text]', 'Pip Stairs');
  await wiz('Next');
  await p.click('.weapon:has-text("Practice Sword")');
  await p.click('.mtable .row:has-text("Wobbly Poke")');
  await p.click('.mtable .row:has-text("Gentle Swipe")');
  await wiz('Next');
  await p.click('.option:has-text("Padded Tablecloth")');
  await wiz('Next');
  await p.click('.option:has-text("Scroll of Mild Glow")');
  await wiz('Next');
  await wiz('Begin');
  await p.waitForTimeout(500);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(800);
  await tap(12.5, 25.5);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await btn('Done');
  await btn('Done');
  await p.waitForTimeout(1500);
  if (await p.isVisible('[data-testid=go-down]')) problems.push(`${tag}: Go down offered before any stairs`);
  await p.click('header.toolbar button.tool:text-is("Stairs")');
  await tap(12.5, 23.5);
  await p.waitForTimeout(300);
  const goLabel = (await p.textContent('[data-testid=go-down]'))?.trim();
  if (goLabel !== 'Go down to Level 2') problems.push(`${tag}: button reads "${goLabel}"`);
  await checkPanelOn(p, tag);
  await shot('49-stairs.png', p);
  await p.click('[data-testid=go-down]');
  await p.waitForSelector('[data-testid=stairs-dialog]');
  const dlg = (await p.innerText('[data-testid=stairs-dialog]')).replace(/\s+/g, ' ');
  console.log(`${tag}: dialog "${dlg}"`);
  if (!/Eat a ration/.test(dlg) || !/Don't eat/.test(dlg) || !/Cloth or bandage/.test(dlg)) problems.push(`${tag}: dialog text "${dlg}"`);
  const undoDlg = await p.textContent('header.toolbar button.history');
  await p.keyboard.press('Control+z');
  await p.keyboard.press('Control+y');
  await p.waitForTimeout(200);
  if ((await p.textContent('header.toolbar button.history')) !== undoDlg) problems.push(`${tag}: Ctrl+Z/Y changed history behind the stairs dialog`);
  const before = (await saved()).history.hero;
  await p.click('[data-testid=stairs-dialog] button:has-text("Eat a ration")');
  await p.waitForTimeout(2000);
  await banner('after going down');
  const level = (await p.textContent('[data-testid=level-indicator]'))?.trim();
  if (!level?.startsWith('Level 2')) problems.push(`${tag}: level indicator "${level}"`);
  const rec = await saved();
  const hero = rec.history.hero;
  console.log(`${tag}: rations ${before.rations} -> ${hero.rations}, hp ${before.hp} -> ${hero.hp}, level ${rec.history.current.level}, earlier ${rec.meta.earlierLevels.length}`);
  if (hero.rations !== before.rations - 1) problems.push(`${tag}: rations ${before.rations} -> ${hero.rations}`);
  if (rec.history.current.level !== 2 || rec.history.current.rooms.length !== 0) problems.push(`${tag}: new map is not a fresh Level 2`);
  if (rec.meta.earlierLevels.length !== 1 || rec.meta.earlierLevels[0].level !== 1) problems.push(`${tag}: earlier levels not kept`);
  if (!(await p.isDisabled('header.toolbar button.history'))) problems.push(`${tag}: undo should start empty on the new level`);
  await shot('49a-level-2.png', p);
  // The new level's entrance: three archways, no doubles (1-1 stays a 1x1... the clamp applies, no second roll).
  await p.click('header.toolbar button.tool:text-is("Play")');
  await tap(12.5, 25.5);
  await rollerEnterOn(p, '2', '2');
  const stepAfter = await p.getAttribute('aside.panel .body', 'data-step');
  if (stepAfter !== 'position') problems.push(`${tag}: doubles on the entrance asked for a second roll (step ${stepAfter})`);
  await btn('Place');
  const exitsStep = await p.getAttribute('aside.panel .body', 'data-step');
  if (exitsStep !== 'exits') problems.push(`${tag}: entrance did not go to exits (step ${exitsStep})`);
  await btn('Done');
  await p.waitForTimeout(300);
  await btn('Done');
  await p.waitForTimeout(1500);
  const rec2 = await saved();
  const doors = rec2.history.current.doors.map((d) => d.type);
  console.log(`${tag}: level 2 doors ${doors.join(',')}`);
  const exitStubs = rec2.history.current.rooms.filter((r) => r.kind === 'passage').length;
  if (exitStubs !== 3 || doors.some((t) => t !== 'archway')) problems.push(`${tag}: expected 3 archway exits, got ${exitStubs} stubs and doors ${doors.join(',')}`);
  // Reload.
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const level2 = (await p.textContent('[data-testid=level-indicator]'))?.trim();
  if (!level2?.startsWith('Level 2')) problems.push(`${tag}: after reload the level is "${level2}"`);
  await banner('after reload');
  // Earlier levels, read-only.
  await menu();
  await p.click('[role=menuitem]:has-text("Level 1")');
  await p.waitForSelector('[data-testid=level-viewer]');
  const undoBefore = await p.textContent('header.toolbar button.history');
  await p.keyboard.press('Control+z');
  await p.keyboard.press('Control+y');
  await p.waitForTimeout(200);
  if ((await p.textContent('header.toolbar button.history')) !== undoBefore) problems.push(`${tag}: Ctrl+Z/Y changed history behind the level viewer`);
  const c = await p.$('[data-testid=level-viewer] canvas');
  const box = await c.boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await p.waitForTimeout(300);
  await shot('50-earlier-level.png', p);
  await p.click('[data-testid=level-viewer] button:text-is("Close")');
  await p.waitForTimeout(300);
  if ((await p.textContent('header.toolbar button.history')) !== undoBefore) problems.push(`${tag}: viewing an earlier level changed the undo step`);
  if (await p.isVisible('[data-testid=level-viewer]')) problems.push(`${tag}: viewer did not close`);
  const after = await saved();
  if (JSON.stringify(after.meta.earlierLevels) !== JSON.stringify(rec2.meta.earlierLevels)) problems.push(`${tag}: earlier level changed while viewing`);
  // Export holds both maps.
  await menu();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[role=menuitem]:text-is("Export game")')]);
  const exported = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  console.log(`${tag}: export holds ${exported.maps?.length} maps`);
  if (exported.maps?.length !== 2) problems.push(`${tag}: export has ${exported.maps?.length} maps`);
  await banner('at the end');
  await ctx.close();
}

// 16. The encounter pane: a fight added by hand from the fixture's two-creature entry, HP taps,
// turns, shifting the attack dice, rounds and the Fatigue Die, a reload mid-fight, removing the card pack, and the Go down guard.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'encounter pane';
  const tap = async (x, y) => {
    const at = await p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(150);
  };
  const btn = (name) => p.click(`aside.panel button:text-is("${name}")`);
  const wiz = (t) => p.click(`[role=dialog][aria-labelledby=wizard-title] button:text-is("${t}")`);
  const menu = () => p.click('header.toolbar button[aria-label="Menu"]');
  const undoText = async () => (await p.textContent('header.toolbar button.history'))?.trim() ?? '';
  const pane = '.encounter-pane';
  const foeHp = (name) => p.textContent(`${pane} .foe:has(.name span:text-is("${name}")) .num`).then((t) => t?.trim());
  const addByHand = async (name) => {
    await p.click(`${pane} button:text-is("Add creature")`);
    await p.fill('.encounter-picker input[type=search]', name);
    await p.click(`.encounter-picker .pick:not(.add):has(.name:text-is("${name}"))`);
    await p.waitForTimeout(150);
  };
  const state = async () => ({
    turn: (await p.textContent(`${pane} [data-testid=turn]`))?.trim(),
    round: (await p.textContent(`${pane} [data-testid=round]`))?.trim(),
    fatigue: (await p.textContent(`${pane} [data-testid=fatigue]`))?.trim(),
    foes: await p.$$eval(`${pane} .foe`, (els) => els.map((e) => `${e.querySelector('.name span')?.textContent?.trim()}:${e.querySelector('.num')?.textContent?.trim()}`)),
  });

  // In-memory copy only: the hero's Wobbly Poke deals "D6 +1", so its hit offers a damage roll.
  const withPokeDamage = (fx) => {
    for (const w of fx.tables.weapons ?? []) for (const m of w.manoeuvres) if (m.name === 'Wobbly Poke') m.damage = 'D6 +1';
    fx.tables.creatures['Moss Lurker'].prime = 'Made-up spores burst. Lose D6 HP.';
    return withThrowing(fx);
  };
  await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withPokeDamage(JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8'))))) });
  await p.waitForTimeout(500);
  // A made-up card for one of the fixture creatures, so the pane has a picture to lose later.
  const img = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 420;
    const g = c.getContext('2d');
    g.fillStyle = '#c96';
    g.fillRect(0, 0, 300, 420);
    g.fillStyle = '#222';
    g.font = '160px sans-serif';
    g.textAlign = 'center';
    g.fillText('G', 150, 260);
    return c.toDataURL('image/png');
  });
  const pack = { format: 1, systemId: 'dungeon', name: 'Made-up cards', cards: [{ id: 'g1', name: 'Grumbler', level: 1, image: img }] };
  await p.setInputFiles('input[data-extra="cards"]', { name: 'cards.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await p.waitForTimeout(500);
  await menu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Next');
  await p.fill('[aria-labelledby=wizard-title] input[type=text]', 'Pip Fight');
  await wiz('Next');
  await p.click('.weapon:has-text("Practice Sword")');
  await p.click('.mtable .row:has-text("Wobbly Poke")');
  await p.click('.mtable .row:has-text("Gentle Swipe")');
  await wiz('Next');
  await p.click('.option:has-text("Padded Tablecloth")');
  await wiz('Next');
  await p.click('.option:has-text("Scroll of Mild Glow")');
  await wiz('Next');
  await wiz('Begin');
  await p.waitForTimeout(500);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(800);
  await tap(12.5, 25.5);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await btn('Done');
  await btn('Done');
  await p.waitForTimeout(1500);
  await p.click('header.toolbar button.tool:text-is("Stairs")');
  await tap(12.5, 23.5);
  await p.waitForTimeout(300);
  if (!(await p.isEnabled('[data-testid=go-down]'))) problems.push(`${tag}: Go down disabled before any fight`);
  await p.click('header.toolbar button.tool:text-is("Play")');

  // 16a. The fixture's two-creature entry (Grumbler, Moss Lurker), added by hand.
  await p.click('header.toolbar button.encounter');
  await p.waitForSelector(pane);
  if (!(await p.isVisible(`${pane} >> text=No fight yet`))) problems.push(`${tag}: empty pane text missing`);
  await addByHand('Grumbler');
  if ((await undoText()) !== 'Undo Start encounter' && !(await undoText()).includes('Start encounter')) problems.push(`${tag}: first creature: undo "${await undoText()}"`);
  await addByHand('Moss Lurker');
  if (!(await undoText()).includes('Add Moss Lurker')) problems.push(`${tag}: second creature: undo "${await undoText()}"`);
  const s0 = await state();
  console.log(`${tag}: start ${JSON.stringify(s0)}`);
  if (s0.foes.join('|') !== 'Grumbler:4|Moss Lurker:6' || s0.round !== 'Round 1' || s0.fatigue !== '+0 Shift' || s0.turn !== 'Your turn') problems.push(`${tag}: start state ${JSON.stringify(s0)}`);
  const stats = (await p.textContent(`${pane} .foe:has(.name span:text-is("Grumbler")) .stats`))?.replace(/\s+/g, ' ').trim();
  if (!stats?.includes('SH 0 (+0)') || !stats.includes('XP 2') || !stats.includes('Treasure: Made-up: a pouch of pebbles.')) problems.push(`${tag}: Grumbler stats "${stats}"`);
  if ((await p.$$(`${pane} .thumb img`)).length !== 1) problems.push(`${tag}: expected one card image`);
  if (!(await p.isVisible(`${pane} [data-testid=hero-hp]`))) problems.push(`${tag}: hero HP tracker missing`);
  // HP buttons are at least 56 px; every pane button at least 44.
  const hpBtns = await p.$$eval(`${pane} .hp button`, (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 56 || r.height < 56).length);
  if (hpBtns) problems.push(`${tag}: ${hpBtns} HP buttons under 56 px`);
  const smallBtns = await p.$$eval(`${pane} button`, (els) => els.map((e) => ({ t: e.textContent?.trim(), r: e.getBoundingClientRect() })).filter((b) => b.r.width > 0 && (b.r.width < 44 || b.r.height < 44)).map((b) => b.t));
  if (smallBtns.length) problems.push(`${tag}: small pane buttons ${smallBtns.join(', ')}`);
  // Two quick taps down: one step.
  await p.click(`${pane} button[aria-label="Grumbler HP down"]`);
  await p.click(`${pane} button[aria-label="Grumbler HP down"]`);
  if ((await foeHp('Grumbler')) !== '2') problems.push(`${tag}: Grumbler HP after two taps ${await foeHp('Grumbler')}`);
  if (!(await undoText()).includes('Grumbler HP −2')) problems.push(`${tag}: merged tap label "${await undoText()}"`);
  // Typed HP: not a whole number is ignored.
  await p.click(`${pane} .foe:has(.name span:text-is("Moss Lurker")) .num`);
  await p.fill(`${pane} .foe:has(.name span:text-is("Moss Lurker")) input`, '2.5');
  await p.keyboard.press('Enter');
  if ((await foeHp('Moss Lurker')) !== '6') problems.push(`${tag}: typed 2.5 was not ignored`);
  // Throws before the attack: they ask the floating roller, and commit one History step.
  {
    const tp = `${pane} [data-testid=throw-panel]`;
    const forText = async () => ((await p.textContent(`${rollerPanel} [data-testid=dice-for]`)) ?? '').replace(/\s+/g, ' ').trim();
    const throwBtn = `${tp} button:has-text("Throw Spare Bootlace")`;
    await rollerEnterModeOn(p, true);
    await p.click(throwBtn);
    if (!(await forText()).includes('Throw Spare Bootlace at Grumbler')) problems.push(`${tag}: throw not asked of the roller: "${await forText()}"`);
    await rollerEnterOn(p, '7', '1');
    if (!(await p.isVisible(`${rollerPanel} [data-testid=dice-typed] [role=alert]`))) problems.push(`${tag}: typed 7 for a throw showed no error`);
    if (!(await p.isVisible(throwBtn))) problems.push(`${tag}: an invalid typed throw was applied`);
    await rollerEnterOn(p, '3', '4');
    if (!(await undoText()).includes('Throw Bootlace')) problems.push(`${tag}: typed throw undo "${await undoText()}"`);
    if (await p.isVisible(throwBtn)) problems.push(`${tag}: thrown weapon still offered`);
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(200);
    if (!(await p.isVisible(throwBtn))) problems.push(`${tag}: Undo of the throw did not bring the weapon back`);
    // Rolled in the roller itself.
    await rollerEnterModeOn(p, false);
    await p.click(throwBtn);
    await p.waitForTimeout(1100);
    if (!(await undoText()).includes('Throw Bootlace')) problems.push(`${tag}: rolled throw undo "${await undoText()}"`);
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(200);
    // A bomb with damage dice asks for them.
    await p.click(`${tp} button:has-text("Mild Cheer")`);
    if (!(await forText()).includes('Mild Cheer at Grumbler')) problems.push(`${tag}: bomb not asked of the roller: "${await forText()}"`);
    await p.waitForTimeout(1100);
    if (!(await undoText()).includes('Throw Mild Cheer')) problems.push(`${tag}: bomb undo "${await undoText()}"`);
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(200);
    // An un-rolled request does not outlive the turn.
    await rollerEnterModeOn(p, true);
    await p.click(throwBtn);
    await p.click(`${pane} button:text-is("Next turn")`);
    await p.waitForTimeout(200);
    if ((await forText()).includes('Throw Spare Bootlace')) problems.push(`${tag}: an unrolled throw was still the roller's target after Next turn`);
    await p.keyboard.press('Control+z');
    await p.waitForTimeout(200);
    await rollerEnterModeOn(p, true);
  }
  // Turns and the attack dice. The hero (Shift 2) knows Wobbly Poke 1-4 and Gentle Swipe 2-6.
  const td = `${pane} [data-testid=turn-dice]`;
  const sh = `${rollerPanel} [data-testid=dice-shifter]`;
  // The attack card hands the dice to the roller: aim the roller at it, then type red and blue there.
  const typeDice = async (a, b) => {
    await rollerEnterModeOn(p, true);
    await p.click(`${td} [data-testid=roll-card] button`);
    await rollerEnterOn(p, a, b);
  };
  const faces = () => p.$$eval(`${td} [data-testid=attack-die]`, (els) => els.map((e) => e.dataset.value).join('-'));
  const shiftLeft = async () => (await p.textContent(`${sh} [data-testid=shift-left]`))?.trim();
  const lit = () => p.$$eval(`${pane} [data-testid=manoeuvre].match .m-name`, (els) => els.map((e) => e.textContent.trim()).join('|'));
  const rollNoteText = async () => ((await p.isVisible(`${td} [data-testid=roll-note]`)) ? (await p.textContent(`${td} [data-testid=roll-note] p`))?.trim() : null);
  const nextTurn = () => p.click(`${pane} button:text-is("Next turn")`);
  const turnText = async () => (await p.textContent(`${pane} [data-testid=turn]`))?.trim();
  const ms = await p.$$eval(`${pane} [data-testid=manoeuvre] .m-name`, (els) => els.map((e) => e.textContent.trim()).join('|'));
  if (ms !== 'Wobbly Poke|Gentle Swipe') problems.push(`${tag}: hero manoeuvres listed "${ms}"`);
  await typeDice(2, 4);
  if ((await faces()) !== '2-4' || (await shiftLeft()) !== 'Shift left: 2 of 2' || (await lit()) !== '') problems.push(`${tag}: 2-4 rolled: ${await faces()} "${await shiftLeft()}" lit "${await lit()}"`);
  await p.click(`${sh} button[aria-label="Red die down"]`);
  if ((await faces()) !== '1-4' || (await shiftLeft()) !== 'Shift left: 1 of 2' || (await lit()) !== 'Wobbly Poke') problems.push(`${tag}: one shift down: ${await faces()} "${await shiftLeft()}" lit "${await lit()}"`);
  if ((await rollNoteText()) !== null) problems.push(`${tag}: a shifted match was called "${await rollNoteText()}"`);
  const histTop = async () => (await p.textContent(`${rollerPanel} [data-testid=dice-history] li >> nth=0`).catch(() => ''))?.trim() ?? '';
  if (!/\(shifted to 1, 4\)$/.test(await histTop())) problems.push(`${tag}: roller history after a shift "${await histTop()}"`);
  if ((await p.textContent(`${td}`))?.includes('Shift in the dice roller') !== true) problems.push(`${tag}: pane lacks the "Shift in the dice roller" line`);
  await shot('51a-shift-match.png', p);
  // Left-click the blue die: up one, the pool is spent and nothing matches.
  await p.click(`${sh} [data-testid=shift-die] >> nth=1`);
  if ((await faces()) !== '1-5' || (await shiftLeft()) !== 'Shift left: 0 of 2' || (await lit()) !== '') problems.push(`${tag}: blue up: ${await faces()} "${await shiftLeft()}" lit "${await lit()}"`);
  if (!(await p.isDisabled(`${sh} button[aria-label="Blue die up"]`)) || !(await p.isDisabled(`${sh} button[aria-label="Red die down"]`))) problems.push(`${tag}: arrows not disabled with the pool spent`);
  await p.click(`${sh} [data-testid=shift-die] >> nth=1`);
  if ((await faces()) !== '1-5') problems.push(`${tag}: shifted past the pool: ${await faces()}`);
  // Right-click the blue die: back down, the point comes back.
  await p.click(`${sh} [data-testid=shift-die] >> nth=1`, { button: 'right' });
  if ((await faces()) !== '1-4' || (await shiftLeft()) !== 'Shift left: 1 of 2' || (await lit()) !== 'Wobbly Poke') problems.push(`${tag}: right-click refund: ${await faces()} "${await shiftLeft()}" lit "${await lit()}"`);
  // A free roll sets the roller loose from the attack; the pane's button points it back and the shifter returns.
  await p.click(`${rollerPanel} button[aria-label="Roll freely"]`);
  if (await p.isVisible(sh)) problems.push(`${tag}: shifter still shown after a free roll took the roller`);
  await p.click(`${td} button:text-is("Shift in the dice roller")`);
  if (!(await p.isVisible(sh)) || (await faces()) !== '1-4' || (await shiftLeft()) !== 'Shift left: 1 of 2') problems.push(`${tag}: re-aiming at the attack: shifter ${await p.isVisible(sh)} ${await faces()} "${await shiftLeft()}"`);
  if (!(await p.textContent(`${rollerPanel} [data-testid=dice-for]`))?.includes('Your attack')) problems.push(`${tag}: roller not back on the attack: "${await p.textContent(`${rollerPanel} [data-testid=dice-for]`)}"`);
  const smallTd = await p.$$eval(`${sh} button`, (els) => els.map((e) => ({ t: e.getAttribute('aria-label') ?? e.textContent?.trim(), r: e.getBoundingClientRect() })).filter((b) => b.r.width > 0 && (b.r.width < 44 || b.r.height < 44)).map((b) => b.t));
  if (smallTd.length) problems.push(`${tag}: small attack-dice buttons ${smallTd.join(', ')}`);
  // A natural match is an Exact Strike; a natural 1-1 always misses and can't be shifted.
  await p.click(`${sh} button:text-is("Roll again")`);
  await typeDice(1, 4);
  if ((await rollNoteText()) !== 'Exact Strike: add your Shift to the damage' || (await lit()) !== 'Wobbly Poke') problems.push(`${tag}: exact strike "${await rollNoteText()}" lit "${await lit()}"`);
  await shot('51b-exact-strike.png', p);
  // A damage button hands its roll to the floating roller and leaves the total beside itself.
  const dmgBtn = `${pane} [data-testid=manoeuvre].match button.m-roll`;
  const dmgNote = `${pane} [data-testid=manoeuvre].match [data-testid=damage-note]`;
  if (!(await p.isVisible(dmgBtn))) problems.push(`${tag}: no damage button on the hit manoeuvre`);
  else {
    await rollerEnterModeOn(p, false);
    await p.click(dmgBtn);
    await p.waitForTimeout(1100);
    const noteRolled = (await p.textContent(dmgNote).catch(() => ''))?.trim() ?? '';
    if (!/^Rolled [1-7] damage$/.test(noteRolled)) problems.push(`${tag}: rolled damage note "${noteRolled}"`);
    const hist = (await p.textContent(`${rollerPanel} [data-testid=dice-history] li >> nth=0`).catch(() => ''))?.trim() ?? '';
    if (!hist.startsWith('Wobbly Poke damage')) problems.push(`${tag}: roller history starts "${hist}"`);
    // Typed: a 7 is refused in the roller; a 4 gives 4 + 1.
    await rollerEnterModeOn(p, true);
    await p.click(dmgBtn);
    await rollerEnterOn(p, '7');
    if (!(await p.isVisible(`${rollerPanel} >> text=Type a number from 1 to 6.`))) problems.push(`${tag}: typed 7 damage not refused`);
    await rollerEnterOn(p, '4');
    const noteTyped = (await p.textContent(dmgNote).catch(() => ''))?.trim() ?? '';
    if (noteTyped !== 'Rolled 5 damage') problems.push(`${tag}: typed damage note "${noteTyped}"`);
    await shot('51c-damage-note.png', p);
  }
  await p.click(`${sh} button:text-is("Roll again")`);
  await typeDice(1, 1);
  if ((await rollNoteText()) !== 'Double 1: always a miss' || !(await p.isDisabled(`${sh} button[aria-label="Red die up"]`))) problems.push(`${tag}: double 1 "${await rollNoteText()}"`);
  await p.click(`${sh} button:text-is("Roll again")`);
  await typeDice(6, 6);
  if ((await rollNoteText()) !== 'Prime Attack: pick any manoeuvre and add your Shift to the damage') problems.push(`${tag}: hero double 6 "${await rollNoteText()}"`);
  // Next turn: Grumbler (SH 0, round 1: no pool); the dice start afresh.
  await nextTurn();
  if ((await turnText()) !== "Grumbler's turn") problems.push(`${tag}: after the hero's turn "${await turnText()}"`);
  if (!(await undoText()).includes('Next turn')) problems.push(`${tag}: Next turn undo "${await undoText()}"`);
  if (!(await p.isVisible(`${pane} .foe.current:has(.name span:text-is("Grumbler"))`))) problems.push(`${tag}: Grumbler's card not marked on its turn`);
  if (await p.isVisible(`${td} [data-testid=attack-die]`)) problems.push(`${tag}: the hero's dice carried into Grumbler's turn`);
  if (!(await p.isVisible(`${td} [data-testid=roll-card]`)) || (await p.isVisible(sh))) problems.push(`${tag}: Grumbler's turn does not show a fresh waiting card`);
  if (!(await p.textContent(`${rollerPanel} [data-testid=dice-for]`))?.includes("Grumbler's attack")) problems.push(`${tag}: roller not asked for Grumbler's attack: "${await p.textContent(`${rollerPanel} [data-testid=dice-for]`)}"`);
  await typeDice(6, 6);
  if ((await rollNoteText()) !== "Prime Attack: see the bottom of its card Armour can't deflect it." || (await shiftLeft()) !== 'Shift left: 0 of 0' || (await lit()) !== '') problems.push(`${tag}: creature 6-6 "${await rollNoteText()}" "${await shiftLeft()}"`);
  // No roll named on the card: no Roll button in the note. Other dice in the roller leave the attack for a free roll.
  if (await p.isVisible(`${td} [data-testid=roll-note-roll]`)) problems.push(`${tag}: a Roll button on a note that names no roll`);
  await p.click(`${rollerPanel} [role=group][aria-label=Die] button:text-is("D6")`);
  if ((await p.textContent(`${rollerPanel} [data-testid=dice-for]`))?.trim() !== 'Free roll' || !(await p.isVisible(`${td} [data-testid=attack-die]`))) problems.push(`${tag}: D6 during an attack: "${await p.textContent(`${rollerPanel} [data-testid=dice-for]`)}"`);
  await p.click(`${td} button:text-is("Shift in the dice roller")`);
  if (!(await p.textContent(`${rollerPanel} [data-testid=dice-for]`))?.includes("Grumbler's attack")) problems.push(`${tag}: roller not back on the attack after a free D6`);
  // The attacking creature's card sits above its dice: its bottom, the dice and Next turn all on screen.
  const seen = await p.evaluate(() => {
    const body = document.querySelector('.encounter-pane .body').getBoundingClientRect();
    const bar = document.querySelector('.encounter-pane [data-testid=turn-bar]').getBoundingClientRect();
    const card = document.querySelector('.encounter-pane .foe.current')?.getBoundingClientRect();
    const dice = document.querySelector('.encounter-pane [data-testid=turn-dice]').getBoundingClientRect();
    const next = [...document.querySelectorAll('.encounter-pane button')].find((b) => b.textContent.trim() === 'Next turn').getBoundingClientRect();
    const inside = (r) => r.top >= bar.bottom - 1 && r.bottom <= body.bottom + 1;
    return {
      cardBottom: !!card && card.bottom > bar.bottom && card.bottom <= body.bottom + 1,
      cardAboveDice: !!card && card.bottom <= dice.top + 1,
      dice: inside(dice),
      next: next.top >= body.top - 1 && next.bottom <= body.bottom + 1,
    };
  });
  if (!seen.cardBottom || !seen.cardAboveDice || !seen.dice || !seen.next) problems.push(`${tag}: creature turn not all in view ${JSON.stringify(seen)}`);
  await shot('51c-creature-turn.png', p);
  // Undo of Next turn: back to the hero with no dice; Next turn again starts Grumbler afresh.
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(200);
  if ((await turnText()) !== 'Your turn' || (await p.isVisible(`${td} [data-testid=attack-die]`))) problems.push(`${tag}: Undo of Next turn: "${await turnText()}", dice ${await p.isVisible(`${td} [data-testid=attack-die]`)}`);
  await nextTurn();
  if ((await turnText()) !== "Grumbler's turn" || (await p.isVisible(`${td} [data-testid=attack-die]`))) problems.push(`${tag}: Next turn after Undo: "${await turnText()}", dice ${await p.isVisible(`${td} [data-testid=attack-die]`)}`);
  await nextTurn();
  if ((await turnText()) !== "Moss Lurker's turn") problems.push(`${tag}: second creature "${await turnText()}"`);
  await typeDice(1, 1);
  if ((await rollNoteText()) !== 'Mishap: see the bottom of its card') problems.push(`${tag}: creature 1-1 "${await rollNoteText()}"`);
  // Its Prime names a roll: the note rolls it in the roller and shows what it came to.
  await p.click(`${sh} button:text-is("Roll again")`);
  await typeDice(6, 6);
  if (!(await rollNoteText())?.startsWith('Prime Attack: Made-up spores burst. Lose D6 HP.')) problems.push(`${tag}: Moss Lurker 6-6 "${await rollNoteText()}"`);
  await p.click(`${td} [data-testid=roll-note-roll]`);
  if (!(await p.textContent(`${rollerPanel} [data-testid=dice-for]`))?.includes('Prime Attack damage · D6')) problems.push(`${tag}: Prime roll not asked of the roller: "${await p.textContent(`${rollerPanel} [data-testid=dice-for]`)}"`);
  await rollerEnterOn(p, 4);
  if ((await p.textContent(`${td} [data-testid=roll-note-result]`))?.trim() !== 'Rolled 4 damage') problems.push(`${tag}: Prime roll result "${await p.textContent(`${td} [data-testid=roll-note-result]`).catch(() => null)}"`);
  if (!(await p.textContent(`${rollerPanel} [data-testid=dice-for]`))?.includes("Moss Lurker's attack")) problems.push(`${tag}: roller not back on the attack after the Prime roll`);
  // Past the last creature: round 2, the Fatigue Die shows 2, back to the hero.
  await nextTurn();
  const r2 = await state();
  const die2 = await p.getAttribute(`${pane} .round [role=img]`, 'aria-label');
  if (r2.turn !== 'Your turn' || r2.round !== 'Round 2' || die2 !== 'red 2') problems.push(`${tag}: round 2 ${JSON.stringify(r2)} die "${die2}"`);
  // On to round 4 and Grumbler's turn there (SH 0 + 1 fatigue: a pool of 1).
  for (let i = 0; i < 7; i++) await nextTurn();
  const s1 = await state();
  console.log(`${tag}: round 4 ${JSON.stringify(s1)}`);
  if (s1.round !== 'Round 4' || s1.fatigue !== '+1 Shift' || s1.turn !== "Grumbler's turn") problems.push(`${tag}: round 4 state ${JSON.stringify(s1)}`);
  if (!(await p.textContent(`${pane} .foe:has(.name span:text-is("Grumbler")) .stats`))?.includes('SH 0 (+1)')) problems.push(`${tag}: foe Shift without the fatigue bonus`);
  if (await p.isVisible(`${pane} .reminder`)) problems.push(`${tag}: round 7 reminder shown at round 4`);
  await typeDice(3, 3);
  if ((await shiftLeft()) !== 'Shift left: 1 of 1') problems.push(`${tag}: Grumbler's round-4 pool "${await shiftLeft()}"`);
  if (await p.isVisible(`${pane} .combat-dice`)) problems.push(`${tag}: the old in-pane roller is back (the floating dice roller replaces it)`);
  await shot('51-encounter-pane.png', p);

  // 16b. Reload mid-fight: round, HP and creatures come back, with the pane.
  await p.waitForTimeout(1500);
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector(pane, { timeout: 5000 }).catch(() => problems.push(`${tag}: pane not shown after reload`));
  const s2 = await state();
  console.log(`${tag}: after reload ${JSON.stringify(s2)}`);
  if (JSON.stringify(s2) !== JSON.stringify(s1)) problems.push(`${tag}: reload changed the fight: ${JSON.stringify(s2)}`);
  await shot('52-encounter-reloaded.png', p);

  // 16c. Remove the card pack mid-fight: the fight stays, without pictures.
  await menu();
  await p.click('.menu [data-status="cards"] button:text-is("Remove")');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const s3 = await state();
  if (JSON.stringify(s3) !== JSON.stringify(s1)) problems.push(`${tag}: removing the pack changed the fight: ${JSON.stringify(s3)}`);
  if ((await p.$$(`${pane} .thumb img`)).length !== 0) problems.push(`${tag}: card image still shown after removing the pack`);
  await p.click(`${pane} button:text-is("Add creature")`);
  if (!(await p.isVisible('.encounter-picker >> text=Load creature cards to search by picture'))) problems.push(`${tag}: no-pack note missing in Add creature`);
  await p.click('.encounter-picker button[aria-label="Close creature search"]');
  await shot('53-encounter-no-pack.png', p);

  // 16d. Go down waits for the fight: the toolbar button puts the pane aside to show the step panel.
  await p.click('header.toolbar button.encounter');
  await p.waitForSelector('[data-testid=go-down]');
  if (!(await p.isDisabled('[data-testid=go-down]'))) problems.push(`${tag}: Go down enabled during a fight`);
  const note = (await p.textContent('[data-testid=go-down-note]'))?.trim();
  if (note !== 'Finish or end the encounter first.') problems.push(`${tag}: Go down note "${note}"`);
  await shot('54-encounter-go-down.png', p);
  await p.click('header.toolbar button.encounter');
  await p.waitForSelector(pane);
  await p.click(`${pane} button:text-is("End encounter")`);
  await p.click(`${pane} .confirm button:text-is("End encounter")`);
  await p.waitForTimeout(300);
  if (await p.isVisible(pane)) problems.push(`${tag}: pane still open after End encounter`);
  if (!(await p.isEnabled('[data-testid=go-down]'))) problems.push(`${tag}: Go down still disabled after the fight ended`);
  // Undo brings the fight (and its pane) back.
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  if (!(await p.isVisible(pane))) problems.push(`${tag}: Undo of End encounter did not bring the pane back`);
  await ctx.close();
}

// 17. Encounter-text buttons: a made-up Level 1 encounter text naming "PRAC1 -1", "PRAC2" and a
// creature in capitals. Roll queues a pending roll in the pane; rolling it adds the row's
// creatures; Fight joins the same fight; × drops an unrolled roll; LOOT9 and FP
// stay plain text; the room inspector shows the same buttons.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'encounter text';
  const tap = async (x, y) => {
    const at = await p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(150);
  };
  const btn = (name) => p.click(`aside.panel button:text-is("${name}")`);
  const menu = () => p.click('header.toolbar button[aria-label="Menu"]');
  const undoText = async () => (await p.textContent('header.toolbar button.history'))?.trim() ?? '';
  const pane = '.encounter-pane';
  // The pending roll's card hands the roll to the floating roller: roll there, or type there.
  const card = `${pane} [data-testid=pending-roll] [data-testid=roll-card]`;
  const pendingRollerRoll = async (sel = card) => {
    await rollerEnterModeOn(p, false);
    await p.click(`${sel} button`);
    await p.waitForTimeout(1100);
  };
  const foes = () => p.$$eval(`${pane} .foe`, (els) => els.map((e) => `${e.querySelector('.name span')?.textContent?.trim()}:${e.querySelector('.num')?.textContent?.trim()}`));
  const ENC = 'Made-up: PRAC1 -1 waits here, or PRAC2. A GRUMBLER guards LOOT9; spend 1 FP.';

  // The fixture with every Level 1 room's encounter text swapped for ENC (in memory: the fixture
  // file is unchanged).
  const fx = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8'));
  const swap = (v) => {
    if (Array.isArray(v)) v.forEach(swap);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) k === 'encounter' && typeof v[k] === 'string' ? (v[k] = ENC) : swap(v[k]);
  };
  swap(fx.tables.dungeonLevels);
  // A description can send you to a table too (a small room has no encounter text to do it).
  fx.tables.dungeonLevels[0].rooms['11'].description = 'A made-up room, number 11. Roll on XX2.';
  await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fx)) });
  await p.waitForTimeout(500);

  const wiz = (t) => p.click(`[role=dialog][aria-labelledby=wizard-title] button:text-is("${t}")`);
  await menu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Next');
  await p.fill('[aria-labelledby=wizard-title] input[type=text]', 'Pip Text');
  await wiz('Next');
  await p.click('.weapon:has-text("Practice Sword")');
  await p.click('.mtable .row:has-text("Wobbly Poke")');
  await p.click('.mtable .row:has-text("Gentle Swipe")');
  await wiz('Next');
  await p.click('.option:has-text("Padded Tablecloth")');
  await wiz('Next');
  await p.click('.option:has-text("Scroll of Mild Glow")');
  await wiz('Next');
  await wiz('Begin');
  await p.waitForTimeout(500);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(800);

  await tap(12.5, 25.5);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await btn('Done');
  await btn('Done');
  await p.waitForTimeout(1500);
  // A second room: its room-table result (the label step) shows the text with its buttons.
  await tap(12.5, 20);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await rollerEnterOn(p, '4');
  await rollerEnterOn(p, '3');
  await btn('Done');
  // Room 11's exit type is random: the name, description and exit roll first; the encounter text
  // (whose Roll and Fight place the room, so need the exit type) only once the exit type is rolled.
  await rollerEnterOn(p, '1', '1');
  await p.waitForSelector('aside.panel [data-testid=room-result]');
  if (await p.isVisible('aside.panel [data-testid=encounter-text]')) problems.push(`${tag}: encounter text shown before the exit type`);
  const pending = (await p.textContent('aside.panel [data-testid=room-result]'))?.replace(/\s+/g, ' ').trim() ?? '';
  if (!pending.includes('Practice Room 11') || !pending.includes('A made-up room, number 11.')) problems.push(`${tag}: room before the exit type "${pending}"`);
  const descButtons = async (where) => {
    const b = await p.$$eval(`${where} [data-testid=room-description] [data-testid=encounter-actions] button`, (els) => els.map((e) => e.textContent.trim()));
    if (b.join('|') !== '📖 Open XX2') problems.push(`${tag}: description buttons ${JSON.stringify(b)} in ${where}`);
  };
  await descButtons('aside.panel');
  await shot('55a-encounter-waits-for-exit-type.png', p);
  await rollerEnterOn(p, '1', '1');
  await p.waitForSelector('aside.panel [data-testid=encounter-text]');
  if (!(await p.isVisible('aside.panel [data-testid=exit-result]'))) problems.push(`${tag}: no exit result with the encounter text`);
  const encText = (await p.textContent('aside.panel [data-testid=encounter-text] .enc-text'))?.trim();
  if (encText !== ENC) problems.push(`${tag}: label step text "${encText}"`);
  const labels = await p.$$eval('aside.panel [data-testid=encounter-text] [data-testid=encounter-actions] button', (els) => els.map((e) => e.textContent.trim()));
  console.log(`${tag}: buttons ${JSON.stringify(labels)}`);
  if (labels.join('|') !== '🎲 Roll on PRAC1 −1|🎲 Roll on PRAC2|⚔ Fight Grumbler') problems.push(`${tag}: buttons ${JSON.stringify(labels)}`);
  const refs = await p.$$eval('aside.panel [data-testid=encounter-text] .ref', (els) => els.map((e) => e.textContent.trim()));
  if (refs.some((r) => /LOOT9|FP/.test(r)) || labels.some((l) => /LOOT9|FP/.test(l))) problems.push(`${tag}: LOOT9 or FP became an action`);
  const small = await p.$$eval('aside.panel [data-testid=encounter-text] [data-testid=encounter-actions] button', (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  if (small) problems.push(`${tag}: ${small} encounter buttons under 44 px`);
  await shot('55-encounter-text-buttons.png', p);
  await descButtons('aside.panel');

  // Roll: places the room first (as Done would), then a pending roll at the top of the pane, which
  // comes to the front. The placed room stays selected: a Room tab beside the fight keeps its text.
  await p.click('aside.panel button:text-is("🎲 Roll on PRAC1 −1")');
  await p.waitForSelector(`${pane} [data-testid=pending-roll]`);
  if (!(await undoText()).includes('Roll on PRAC1 −1')) problems.push(`${tag}: Roll undo "${await undoText()}"`);
  if (!(await p.isVisible('#side-tab-room'))) problems.push(`${tag}: no Room tab beside the fight after Roll placed the room`);
  else {
    await p.click('#side-tab-room');
    await p.waitForSelector('[data-editor=room] [data-testid=encounter-actions]', { timeout: 3000 }).catch(() => problems.push(`${tag}: Room tab shows no encounter buttons`));
    const roomText = (await p.textContent('[data-editor=room]').catch(() => '')) ?? '';
    if (!roomText.includes(ENC)) problems.push(`${tag}: Room tab does not show the placed room's encounter text`);
    await descButtons('[data-editor=room]');
    await shot('56a-encounter-room-tab.png', p);
    await p.click('#side-tab-encounter');
    await p.waitForSelector(`${pane} [data-testid=pending-roll]`);
  }
  // The placed room's buttons: its Room tab, or a tap on the room (which opens that tab beside the fight).
  const roomButtons = async () => {
    if (await p.isVisible('#side-tab-room')) await p.click('#side-tab-room');
    else {
      const fightShown = await p.isVisible(pane);
      await tap(12.5, 18.5);
      if (fightShown && !(await p.isVisible('#side-tab-encounter'))) problems.push(`${tag}: tapping the room mid-fight closed the Encounter tab`);
    }
    await p.waitForSelector('[data-editor=room] [data-testid=encounter-actions]', { timeout: 3000 }).catch(() => problems.push(`${tag}: room inspector shows no encounter buttons`));
  };
  const roomBtn = async (name) => {
    await roomButtons();
    await p.click(`[data-editor=room] button:text-is("${name}")`);
  };
  // The bug this guards: a reload right after Roll keeps both the fight and the room.
  await p.waitForTimeout(1500);
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector(`${pane} [data-testid=pending-roll]`, { timeout: 5000 }).catch(() => problems.push(`${tag}: pending roll not back after reload`));
  // No selection survives a reload: a tap on the room brings its Room tab back beside the fight.
  await roomButtons();
  const placedType = (await p.textContent('[data-editor=room]').catch(() => '')) ?? '';
  if (!placedType.includes(ENC)) problems.push(`${tag}: room lost on reload after Roll`);
  await p.click('#side-tab-encounter');
  await p.waitForSelector(`${pane} [data-testid=pending-roll]`);
  const head = (await p.textContent(`${pane} [data-testid=pending-roll] h3`))?.trim();
  if (head !== 'Roll on PRAC1 −1') problems.push(`${tag}: pending heading "${head}"`);
  const cardText = (await p.textContent(card))?.replace(/\s+/g, ' ').trim() ?? '';
  if (!cardText.includes('Roll on PRAC1 · D6 −1')) problems.push(`${tag}: roll card reads "${cardText}"`);
  // The stored modifier cannot be changed in the roller, in enter mode or out of it.
  await rollerEnterModeOn(p, true);
  await p.click(`${card} button`);
  if ((await p.getAttribute(`${rollerPanel} [data-testid=dice-mod]`, 'readonly')) === null) problems.push(`${tag}: modifier editable for a creature-table roll`);
  await shot('56-encounter-pending-roll.png', p);
  // Roll for me: the sum shown and the creatures added agree with the table.
  await pendingRollerRoll();
  await p.waitForSelector(`${pane} [data-testid=creature-roll-result]`);
  const res = (await p.textContent(`${pane} [data-testid=creature-roll-result] .line`))?.replace(/\s+/g, ' ').trim();
  console.log(`${tag}: rolled "${res}"`);
  const m = /^PRAC1 −1 (\d) − 1 = (\d|−\d)(?:, counts as (\d))?:\s*(.*?)\s*×$/.exec(res ?? '');
  if (!m) problems.push(`${tag}: roll result "${res}"`);
  else {
    const total = Math.min(6, Math.max(1, Number(m[1]) - 1));
    const row = fx.tables.creatureTables.PRAC1[String(total)];
    const want = row.creatures ?? [];
    const got = (await foes()).map((f) => f.split(':')[0]);
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${tag}: rolled ${m[1]}, foes ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    if (m[4] !== want.join(', ')) problems.push(`${tag}: result names "${m[4]}"`);
    const said = (await p.textContent(`${pane} [data-testid=creature-roll-result] .said`).catch(() => null))?.trim() ?? null;
    if (row.text ? said !== row.text : said !== null) problems.push(`${tag}: text row shows "${said}"`);
  }
  if (await p.isVisible(`${pane} [data-testid=pending-roll]`)) problems.push(`${tag}: pending roll still shown after rolling`);
  // Undo brings the pending roll back and takes the result with it; a typed 3 then gives row 2 (Grumbler, Moss Lurker).
  await p.keyboard.press('Control+z');
  await p.waitForSelector(`${pane} [data-testid=pending-roll]`);
  if ((await foes()).length) problems.push(`${tag}: Undo left foes ${JSON.stringify(await foes())}`);
  if (await p.isVisible(`${pane} [data-testid=creature-roll-result]`)) problems.push(`${tag}: Undo left the roll result showing`);
  // The pane's attack card is registered too, but a new plain request takes over from it: the roller is already aimed at the restored pending roll.
  await rollerEnterModeOn(p, true);
  const aimedAt = (await p.textContent(`${rollerPanel} [data-testid=dice-for]`))?.replace(/\s+/g, ' ').trim() ?? '';
  if (!aimedAt.includes('Roll on PRAC1')) problems.push(`${tag}: after Undo the roller is aimed at "${aimedAt}", not the pending roll`);
  await rollerEnterOn(p, '7');
  if (!(await p.isVisible(`${rollerPanel} >> text=Type the die, 1 to 6.`))) problems.push(`${tag}: typed 7 not refused`);
  if (!(await p.isVisible(`${pane} [data-testid=pending-roll]`))) problems.push(`${tag}: typed 7 used the pending roll`);
  await rollerEnterOn(p, '3');
  await p.waitForSelector(`${pane} [data-testid=creature-roll-result]`);
  const typed = (await p.textContent(`${pane} [data-testid=creature-roll-result] .line`))?.replace(/\s+/g, ' ').trim();
  if (typed !== 'PRAC1 −1 3 − 1 = 2: Grumbler, Moss Lurker ×') problems.push(`${tag}: typed result "${typed}"`);
  if ((await foes()).join('|') !== 'Grumbler:4|Moss Lurker:6') problems.push(`${tag}: typed 3 foes ${JSON.stringify(await foes())}`);
  if (!(await undoText()).includes('PRAC1 −1: Grumbler, Moss Lurker')) problems.push(`${tag}: roll undo "${await undoText()}"`);
  await shot('57-encounter-roll-result.png', p);

  // Fight from the placed room: the Grumbler joins the same fight.
  await roomBtn('⚔ Fight Grumbler');
  await p.waitForSelector(pane);
  if ((await foes()).join('|') !== 'Grumbler:4|Moss Lurker:6|Grumbler:4') problems.push(`${tag}: Fight foes ${JSON.stringify(await foes())}`);
  if (!(await undoText()).includes('Add Grumbler')) problems.push(`${tag}: Fight undo "${await undoText()}"`);

  // PRAC2, typed 3 (no modifier): row 3 adds a Grumbler.
  await roomBtn('🎲 Roll on PRAC2');
  await p.waitForSelector(`${pane} [data-testid=pending-roll]`);
  await rollerEnterOn(p, '3');
  const r2 = (await p.textContent(`${pane} [data-testid=creature-roll-result] .line`))?.replace(/\s+/g, ' ').trim();
  if (r2 !== 'PRAC2 3: Grumbler ×') problems.push(`${tag}: PRAC2 result "${r2}"`);
  if ((await foes()).join('|') !== 'Grumbler:4|Moss Lurker:6|Grumbler:4|Grumbler:4') problems.push(`${tag}: PRAC2 foes ${JSON.stringify(await foes())}`);
  if (!(await undoText()).includes('PRAC2: Grumbler')) problems.push(`${tag}: PRAC2 undo "${await undoText()}"`);

  // PRAC2, typed 5: a text row. Its text stays shown after stepping the pane aside and back
  // (it lives in the encounter, not in the pane).
  const echoes = 'Made-up: nothing here but echoes.';
  const saidNow = async () => (await p.$$eval(`${pane} [data-testid=creature-roll-result] .said`, (els) => els.map((e) => e.textContent.trim()))).includes(echoes);
  await roomBtn('🎲 Roll on PRAC2');
  await p.waitForSelector(`${pane} [data-testid=pending-roll]`);
  await rollerEnterOn(p, '5');
  const r5 = (await p.textContent(`${pane} [data-testid=creature-roll-result] .line`))?.replace(/\s+/g, ' ').trim();
  if (r5 !== 'PRAC2 5: ×') problems.push(`${tag}: PRAC2 text result line "${r5}"`);
  if (!(await saidNow())) problems.push(`${tag}: text result not shown`);
  await p.click('header.toolbar button.encounter');
  await p.waitForTimeout(150);
  if (await p.isVisible(pane)) problems.push(`${tag}: Encounter button did not step the pane aside`);
  await p.click('header.toolbar button.encounter');
  await p.waitForSelector(pane);
  if (!(await saidNow())) problems.push(`${tag}: text result gone after switching tabs`);
  if ((await p.$$(`${pane} [data-testid=creature-roll-result]`)).length !== 3) problems.push(`${tag}: expected 3 results after the tab switch, got ${(await p.$$(`${pane} [data-testid=creature-roll-result]`)).length}`);
  await shot('57b-encounter-text-result-after-tab.png', p);
  // × clears a result as its own step; Undo brings it back.
  await p.click(`${pane} [data-testid=creature-roll-result] >> nth=0 >> button[aria-label="Dismiss roll result"]`);
  if (await saidNow()) problems.push(`${tag}: × left the text result`);
  if (!(await undoText()).includes('Clear PRAC2 result')) problems.push(`${tag}: result × undo "${await undoText()}"`);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(150);
  if (!(await saidNow())) problems.push(`${tag}: Undo did not bring the text result back`);

  // × drops an unrolled roll as its own step.
  await roomBtn('🎲 Roll on PRAC1 −1');
  await p.click(`${pane} [data-testid=pending-roll] button[aria-label="Remove roll on PRAC1 −1"]`);
  if (await p.isVisible(`${pane} [data-testid=pending-roll]`)) problems.push(`${tag}: × left the pending roll`);
  if (!(await undoText()).includes('Remove roll on PRAC1 −1')) problems.push(`${tag}: × undo "${await undoText()}"`);
  const smallPane = await p.$$eval(`${pane} button`, (els) => els.map((e) => ({ t: e.textContent?.trim(), r: e.getBoundingClientRect() })).filter((b) => b.r.width > 0 && (b.r.width < 44 || b.r.height < 44)).map((b) => b.t));
  if (smallPane.length) problems.push(`${tag}: small pane buttons ${smallPane.join(', ')}`);

  // The same roll twice ("roll twice": tap again): rolling the first leaves the second ready to roll.
  for (let i = 0; i < 2; i++) await roomBtn('🎲 Roll on PRAC1 −1');
  await p.waitForSelector(`${pane} [data-testid=pending-roll] >> nth=1`);
  if ((await p.$$(`${pane} [data-testid=pending-roll]`)).length !== 2) problems.push(`${tag}: two taps did not queue two rolls`);
  await rollerEnterModeOn(p, false);
  await p.click(`${rollerPanel} button.roll`);
  await p.waitForFunction((sel) => document.querySelectorAll(sel).length === 1, `${pane} [data-testid=pending-roll]`, { timeout: 5000 }).catch(() => problems.push(`${tag}: rolling the first did not resolve it`));
  await p.waitForTimeout(1100);
  const second = `${pane} [data-testid=pending-roll]`;
  const ready = { card: await p.isVisible(`${second} [data-testid=roll-card]`), faces: (await p.$$(`${second} .face`)).length, target: await p.isVisible(`${rollerPanel} [data-testid=dice-for] >> text=Roll on PRAC1`) };
  console.log(`${tag}: second roll after the first ${JSON.stringify(ready)}`);
  if (!ready.card || ready.faces !== 0 || !ready.target) problems.push(`${tag}: second identical roll not ready ${JSON.stringify(ready)}`);
  await pendingRollerRoll(`${second} [data-testid=roll-card]`);
  await p.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, `${pane} [data-testid=pending-roll]`, { timeout: 5000 }).catch(() => problems.push(`${tag}: second identical roll did not resolve`));
  if ((await p.$$(`${pane} [data-testid=creature-roll-result]`)).length < 2) problems.push(`${tag}: expected two roll results`);
  // The typed path: a typed die goes to the first and leaves the second waiting.
  for (let i = 0; i < 2; i++) await roomBtn('🎲 Roll on PRAC1 −1');
  await rollerEnterOn(p, '3');
  await p.waitForFunction((sel) => document.querySelectorAll(sel).length === 1, `${pane} [data-testid=pending-roll]`);
  await rollerEnterOn(p, '3');
  if (await p.isVisible(`${pane} [data-testid=pending-roll]`)) problems.push(`${tag}: second typed roll not resolved`);
  await shot('60-encounter-roll-twice.png', p);
  const beforeFight = (await foes()).length; // while the pane shows

  // The room inspector (a tap in Play) shows the same buttons as the room result did.
  await roomButtons();
  const insp = await p.$$eval('[data-editor=room] [data-testid=encounter-text] [data-testid=encounter-actions] button', (els) => els.map((e) => e.textContent.trim()));
  if (insp.join('|') !== '🎲 Roll on PRAC1 −1|🎲 Roll on PRAC2|⚔ Fight Grumbler') problems.push(`${tag}: inspector buttons ${JSON.stringify(insp)}`);
  await shot('59-encounter-inspector-buttons.png', p);
  await p.click('[data-editor=room] button:text-is("⚔ Fight Grumbler")');
  await p.waitForSelector(pane);
  if ((await foes()).length !== beforeFight + 1) problems.push(`${tag}: inspector Fight foes ${JSON.stringify(await foes())}`);
  // The roll results (the text one included) survive a reload.
  const resultsBefore = await p.$$eval(`${pane} [data-testid=creature-roll-result]`, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector(pane, { timeout: 5000 }).catch(() => problems.push(`${tag}: pane not shown after reload`));
  await p.waitForTimeout(500);
  const resultsAfter = await p.$$eval(`${pane} [data-testid=creature-roll-result]`, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log(`${tag}: ${resultsAfter.length} roll results after reload`);
  if (JSON.stringify(resultsAfter) !== JSON.stringify(resultsBefore)) problems.push(`${tag}: roll results changed on reload: ${JSON.stringify(resultsAfter)} vs ${JSON.stringify(resultsBefore)}`);
  if (!(await saidNow())) problems.push(`${tag}: text result gone after reload`);
  await shot('57c-encounter-results-after-reload.png', p);
  await ctx.close();
}

// 18. Endings: win a fight (the question, Not yet, XP as each creature falls, the Victory panel's treasure lines, Done);
// the End-encounter confirm goes when the fight goes; death from the sheet's HP − (Cancel, no loop,
// asked again), Game Over (survives a reload, Undo off, Export, New game via the wizard).
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'endings';
  const wiz = (t) => p.click(`[role=dialog][aria-labelledby=wizard-title] button:text-is("${t}")`);
  const menu = () => p.click('header.toolbar button[aria-label="Menu"]');
  const undoText = async () => (await p.textContent('header.toolbar button.history'))?.trim() ?? '';
  const pane = '.encounter-pane';
  const winQ = `${pane} .confirm.win`;
  const endQ = `${pane} .confirm:has-text("Creatures are still standing")`;
  const deathQ = '[role=alertdialog][aria-labelledby=death-title]';
  const cover = '[role=dialog][aria-labelledby=game-over-title]';
  const addByHand = async (name) => {
    await p.click(`${pane} button:text-is("Add creature")`);
    await p.fill('.encounter-picker input[type=search]', name);
    await p.click(`.encounter-picker .pick:not(.add):has(.name:text-is("${name}"))`);
    await p.waitForTimeout(150);
  };
  const setFoe = async (name, n) => {
    await p.click(`${pane} .foe:has(.name span:text-is("${name}")) .num`);
    await p.fill(`${pane} .foe:has(.name span:text-is("${name}")) input`, String(n));
    await p.keyboard.press('Enter');
    await p.waitForTimeout(150);
  };
  const newGame = async (name) => {
    await wiz('Next');
    await p.fill('[aria-labelledby=wizard-title] input[type=text]', name);
    await wiz('Next');
    await p.click('.weapon:has-text("Practice Sword")');
    await p.click('.mtable .row:has-text("Wobbly Poke")');
    await p.click('.mtable .row:has-text("Gentle Swipe")');
    await wiz('Next');
    await p.click('.option:has-text("Padded Tablecloth")');
    await wiz('Next');
    await p.click('.option:has-text("Scroll of Mild Glow")');
    await wiz('Next');
    await wiz('Begin');
    await p.waitForTimeout(500);
  };

  // XX2 stands in for the recovery table rolled when the hero drops to 0 HP outside a fight.
  const endTables = withThrowing(JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8')));
  endTables.tables.recoveryTable = 'XX2';
  await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(endTables)) });
  await p.waitForTimeout(500);
  await menu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await newGame('Pip End');
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(500);

  // 18a. The End-encounter confirm goes when the fight goes (here by Undo).
  await p.click('header.toolbar button.encounter');
  await p.waitForSelector(pane);
  await addByHand('Grumbler');
  await p.click(`${pane} button:text-is("End encounter")`);
  if (!(await p.isVisible(endQ))) problems.push(`${tag}: End-encounter confirm not shown`);
  await p.click('header.toolbar button.history >> nth=0'); // Undo "Start encounter": the fight is gone
  await p.waitForTimeout(300);
  if (!(await p.isVisible(pane))) await p.click('header.toolbar button.encounter');
  await p.waitForSelector(pane);
  if (await p.isVisible(endQ)) problems.push(`${tag}: End-encounter confirm still up with no fight`);
  await addByHand('Grumbler');
  if (await p.isVisible(endQ)) problems.push(`${tag}: End-encounter confirm came back with a new fight`);

  // 18b. Win: both foes to 0; the question; Not yet keeps the fight and doesn't loop; a change asks again.
  await addByHand('Moss Lurker');
  // A throw in round 1 (typed), so the Victory panel offers to get the weapon back.
  await rollerEnterModeOn(p, true);
  await p.click(`${pane} [data-testid=throw-panel] button:has-text("Throw Spare Bootlace")`);
  await rollerEnterOn(p, '1', '1');
  if (!(await undoText()).includes('Throw Bootlace')) problems.push(`${tag}: throw before the win: undo "${await undoText()}"`);
  await setFoe('Grumbler', 0);
  if (await p.isVisible(winQ)) problems.push(`${tag}: win asked with a foe standing`);
  // Each creature's XP goes to the hero as it falls, in the same undo step.
  if (!(await undoText()).includes('Grumbler HP 0, XP +2')) problems.push(`${tag}: defeat XP undo "${await undoText()}"`);
  await setFoe('Moss Lurker', 0);
  await p.waitForSelector(winQ, { timeout: 2000 }).catch(() => problems.push(`${tag}: no win question with every foe at 0`));
  const q = (await p.textContent(`${winQ} p`))?.trim();
  if (q !== 'All creatures defeated: win the fight?') problems.push(`${tag}: win question "${q}"`);
  await shot('61-win-question.png', p);
  await p.click(`${winQ} button:text-is("Not yet")`);
  await p.waitForTimeout(400);
  if (await p.isVisible(winQ)) problems.push(`${tag}: win question came straight back after Not yet`);
  if (!(await p.isVisible(`${pane} button:text-is("Next turn")`))) problems.push(`${tag}: Not yet closed the fight`);
  await p.click(`${pane} button:text-is("Next turn")`);
  await p.waitForSelector(winQ, { timeout: 2000 }).catch(() => problems.push(`${tag}: win not asked again after a change`));
  await p.click(`${winQ} button:text-is("Win the fight")`);
  await p.waitForSelector(`${pane} .victory`);
  const lines = await p.$$eval(`${pane} [data-testid=treasure-line]`, (els) => els.map((e) => e.textContent.trim()));
  console.log(`${tag}: treasure ${JSON.stringify(lines)}`);
  if (JSON.stringify(lines) !== JSON.stringify(['Grumbler: Made-up: a pouch of pebbles.'])) problems.push(`${tag}: treasure lines ${JSON.stringify(lines)}`);
  const xpLine = (await p.textContent(`${pane} [data-testid=victory-xp]`))?.trim();
  if (xpLine !== 'XP total: 5 (added as each creature fell)') problems.push(`${tag}: victory XP "${xpLine}"`);
  if (await p.isVisible(`${pane} button:text-is("End encounter")`)) problems.push(`${tag}: End encounter shown beside Victory`);
  const smallV = await p.$$eval(`${pane} .victory button`, (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  if (smallV) problems.push(`${tag}: ${smallV} Victory buttons under 44 px`);
  await shot('62-victory.png', p);
  // Getting the thrown weapon back asks the roller for a D6: a bad typed value is refused, a 5 brings it back (one step).
  const recoverBtn = `${pane} .victory [data-testid=thrown-weapon] button`;
  await p.click(recoverBtn);
  const recoverFor = ((await p.textContent(`${rollerPanel} [data-testid=dice-for]`)) ?? '').replace(/\s+/g, ' ').trim();
  if (!recoverFor.includes('Get back the Bootlace')) problems.push(`${tag}: recovery not asked of the roller: "${recoverFor}"`);
  await rollerEnterOn(p, '7');
  if (!(await p.isVisible(`${rollerPanel} [data-testid=dice-typed] [role=alert]`))) problems.push(`${tag}: typed 7 for the recovery showed no error`);
  if (!(await p.isVisible(recoverBtn))) problems.push(`${tag}: an invalid typed recovery was applied`);
  await rollerEnterOn(p, '5');
  if (!(await undoText()).includes('Recover Bootlace')) problems.push(`${tag}: recovery undo "${await undoText()}"`);
  if (!(await p.textContent(`${pane} .victory [data-testid=thrown-weapon]`))?.includes('recovered, back in your pack')) problems.push(`${tag}: weapon not recovered`);
  if (await p.isVisible(`${pane} .victory button:has-text("XP")`)) problems.push(`${tag}: Victory still offers to add XP`);
  await p.click('header.toolbar button.hero');
  await p.waitForTimeout(300);
  if (await p.isVisible('#side-tab-hero')) await p.click('#side-tab-hero');
  const sheetXp = (await p.textContent('[aria-label="XP total"]'))?.trim();
  if (sheetXp !== '5') problems.push(`${tag}: sheet XP ${sheetXp} after both creatures fell`);
  await shot('63-victory-xp-on-sheet.png', p);
  await p.click('#side-tab-encounter');
  await p.click(`${pane} .victory button:text-is("Done")`);
  await p.waitForTimeout(300);
  if (!(await undoText()).includes('Win the fight')) problems.push(`${tag}: Done undo "${await undoText()}"`);
  if (await p.isVisible(pane)) problems.push(`${tag}: pane still shown after Done`);
  // Undo of Done reopens the fight and asks again; the XP is not added a second time.
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  if (!(await p.isVisible(pane))) await p.click('header.toolbar button.encounter');
  if (await p.isVisible('#side-tab-encounter')) await p.click('#side-tab-encounter');
  await p.waitForSelector(winQ, { timeout: 2000 }).catch(() => problems.push(`${tag}: no win question after undoing Done`));
  await p.click(`${winQ} button:text-is("Win the fight")`);
  await p.waitForSelector(`${pane} .victory`);
  await p.click(`${pane} .victory button:text-is("Done")`);
  await p.waitForTimeout(300);
  if (await p.isVisible(pane)) problems.push(`${tag}: pane still shown after the second Done`);
  if (await p.isVisible('#side-tab-hero')) await p.click('#side-tab-hero');
  const xpAgain = (await p.textContent('[aria-label="XP total"]'))?.trim();
  if (xpAgain !== '5') problems.push(`${tag}: sheet XP ${xpAgain} after undoing Done and winning again`);

  // 18c. Out of a fight, 0 HP knocks the hero out: the recovery table and the roller sit in the dialog.
  if (await p.isVisible('#side-tab-hero')) await p.click('#side-tab-hero');
  await p.waitForSelector('[aria-label="Quick strip"]');
  const hpIn = '[aria-label="Quick strip"] input[aria-label="HP"]';
  const hpDown = () => p.click('[aria-label="Quick strip"] button[aria-label="HP down"]');
  const hpUp = () => p.click('[aria-label="Quick strip"] button[aria-label="HP up"]');
  const hp = Number(await p.inputValue(hpIn));
  for (let i = 0; i < hp; i++) await hpDown();
  await p.waitForSelector(deathQ, { timeout: 2000 }).catch(() => problems.push(`${tag}: no unconscious question at 0 HP out of a fight`));
  const uq = (await p.textContent(`${deathQ} h2`))?.trim();
  if (uq !== 'Your hero falls unconscious') problems.push(`${tag}: unconscious question "${uq}"`);
  if (!(await p.isVisible(`${deathQ} h3:has-text("Practice Trinket Table")`))) problems.push(`${tag}: recovery table not shown in the dialog`);
  if (!(await p.isVisible(`${deathQ} ${rollerPanel}`))) problems.push(`${tag}: roller not in the unconscious dialog`);
  if ((await p.$$(rollerPanel)).length !== 1) problems.push(`${tag}: more than one roller on screen`);
  if (!(await p.evaluate(() => document.querySelector('.shell')?.inert === true))) problems.push(`${tag}: app behind the unconscious question is not inert`);
  const uFor = ((await p.textContent(`${rollerPanel} [data-testid=dice-for]`)) ?? '').replace(/\s+/g, ' ').trim();
  if (!uFor.includes('XX2')) problems.push(`${tag}: roller not aimed at the recovery table: "${uFor}"`);
  await rollerEnterOn(p, '3', '4');
  if (!(await p.isVisible(`${deathQ} [data-testid=ref-result]`))) problems.push(`${tag}: no recovery result in the dialog`);
  if (!(await p.isVisible(`${deathQ} tr.hit`))) problems.push(`${tag}: recovery row not highlighted`);
  await shot('64a-unconscious.png', p);
  const smallU = await p.$$eval(`${deathQ} .actions button`, (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  if (smallU) problems.push(`${tag}: ${smallU} unconscious dialog buttons under 44 px`);
  await p.click(`${deathQ} button:text-is("Hero wakes")`);
  await p.waitForTimeout(400);
  if (await p.isVisible(deathQ)) problems.push(`${tag}: unconscious question stayed after Hero wakes`);
  if (!(await p.isVisible(`.shell ${rollerPanel}`))) problems.push(`${tag}: roller not back in the app after waking`);
  // Putting the sheet right while still at 0 HP or below doesn't ask again; back above 0 then down asks afresh.
  await hpDown();
  await p.waitForTimeout(400);
  if (await p.isVisible(deathQ)) problems.push(`${tag}: asked again while the woken hero's sheet was put right`);
  await hpUp();
  await hpUp();
  await p.waitForTimeout(200);
  await hpDown();
  await p.waitForSelector(deathQ, { timeout: 2000 }).catch(() => problems.push(`${tag}: a new fall to 0 HP did not ask again`));
  await p.click(`${deathQ} button:text-is("Hero wakes")`);
  await hpUp();
  await p.waitForTimeout(200);

  // 18d. In a fight, 0 HP is the foe finishing the hero off.
  await p.click('header.toolbar button.encounter');
  await p.waitForSelector(pane);
  await addByHand('Grumbler');
  if (await p.isVisible('#side-tab-hero')) await p.click('#side-tab-hero');
  await hpDown();
  await p.waitForSelector(deathQ, { timeout: 2000 }).catch(() => problems.push(`${tag}: no death question at 0 HP in a fight`));
  const dq = (await p.textContent(`${deathQ} h2`))?.trim();
  if (dq !== 'Your hero has fallen: confirm their death?') problems.push(`${tag}: death question "${dq}"`);
  if (await p.isVisible(`${deathQ} ${rollerPanel}`)) problems.push(`${tag}: recovery roller shown for a death in a fight`);
  await shot('64-death-question.png', p);
  const deathFocus = await p.evaluate((sel) => !!document.activeElement?.closest(sel), deathQ);
  if (!deathFocus) problems.push(`${tag}: focus not in the death dialog`);
  if (!(await p.evaluate(() => document.querySelector('.shell')?.inert === true))) problems.push(`${tag}: app behind the death question is not inert`);
  await p.click(`${deathQ} button:text-is("Cancel")`);
  await p.waitForTimeout(500);
  if (await p.isVisible(deathQ)) problems.push(`${tag}: death question came straight back after Cancel`);
  const hpNow = await p.inputValue(hpIn);
  if (hpNow !== '0') problems.push(`${tag}: HP after Cancel ${hpNow}`);
  await hpDown();
  await p.waitForSelector(deathQ, { timeout: 2000 }).catch(() => problems.push(`${tag}: death not asked again after another −`));
  await p.click(`${deathQ} button:text-is("Confirm death")`);
  await p.waitForSelector(cover, { timeout: 2000 }).catch(() => problems.push(`${tag}: no Game Over after confirming`));
  const who = (await p.textContent('[data-testid=game-over-hero]'))?.trim();
  if (who !== 'Pip End, level 1') problems.push(`${tag}: Game Over shows "${who}"`);
  const smallG = await p.$$eval(`${cover} button`, (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  if (smallG) problems.push(`${tag}: ${smallG} Game Over buttons under 44 px`);
  await shot('65-game-over.png', p);
  // Undo is off: the shortcut does nothing, the button is disabled.
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  if (!(await p.isDisabled('header.toolbar button.history >> nth=0'))) problems.push(`${tag}: Undo enabled under Game Over`);
  if (!(await p.isVisible(cover))) problems.push(`${tag}: Ctrl+Z took Game Over away`);

  // Keyboard: focus starts on the cover, Tab never reaches a control behind it, and Enter on
  // whatever has focus behind (none can) leaves the saved game as it was.
  const readSaved = () =>
    p.evaluate(
      () =>
        new Promise((res) => {
          const r = indexedDB.open('2d6-dungeon-companion', 1);
          r.onsuccess = () => {
            const g = r.result.transaction('saves', 'readonly').objectStore('saves').get('current');
            g.onsuccess = () => res(JSON.stringify(g.result?.history ?? null));
            g.onerror = () => res(null);
          };
          r.onerror = () => res(null);
        }),
    );
  await p.waitForTimeout(500);
  const savedBefore = await readSaved();
  const focusOn = () => p.evaluate((sel) => {
    const a = document.activeElement;
    return { inCover: !!a?.closest(sel), inShell: !!a?.closest('.shell'), what: a?.textContent?.trim() || a?.getAttribute('aria-label') || a?.tagName };
  }, cover);
  const f0 = await focusOn();
  if (!f0.inCover) problems.push(`${tag}: Game Over focus starts on "${f0.what}"`);
  const behind = [];
  // The shell comes before the cover in the DOM: Shift+Tab walks back into it, Tab walks forward.
  // (Headless Firefox doesn't wrap Tab past the last control, so both directions are tried.)
  for (let i = 0; i < 40; i++) {
    await p.keyboard.press(i < 15 ? 'Shift+Tab' : 'Tab');
    const f = await focusOn();
    if (f.inShell) behind.push(f.what);
    if (f.inShell) await p.keyboard.press('Enter'); // what a keyboard user would do there
  }
  if (behind.length) problems.push(`${tag}: Tab reached controls behind Game Over: ${JSON.stringify(behind)}`);
  // The Undo/Redo shortcuts don't change the saved game either.
  await p.keyboard.press('Control+z');
  await p.keyboard.press('Control+y');
  await p.waitForTimeout(1500);
  const savedAfter = await readSaved();
  if (savedBefore === null || savedAfter !== savedBefore) problems.push(`${tag}: the saved game changed under Game Over`);
  if (!(await p.isVisible(cover))) problems.push(`${tag}: keyboard took Game Over away`);
  // The death dialog's buttons were usable (Cancel and Confirm above); the shell behind it was inert.

  // 18d. Reload: still Game Over.
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector(cover, { timeout: 5000 }).catch(() => problems.push(`${tag}: Game Over not shown after reload`));
  if (await p.isVisible(deathQ)) problems.push(`${tag}: death asked again after reload`);
  await shot('66-game-over-reloaded.png', p);

  // 18e. Export game downloads a file.
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click(`${cover} button:text-is("Export game")`)]);
  if (!dl) problems.push(`${tag}: Game Over Export produced no file`);
  else console.log(`${tag}: exported ${dl.suggestedFilename()}`);

  // 18f. New game: the wizard; Cancel returns to Game Over; finishing it clears Game Over.
  await p.click(`${cover} button:text-is("New game")`);
  await p.waitForSelector('[role=dialog][aria-labelledby=wizard-title]');
  if (await p.isVisible(cover)) problems.push(`${tag}: Game Over covers the wizard`);
  if (await p.evaluate(() => !!document.querySelector('[aria-labelledby=wizard-title]')?.closest('[inert]'))) problems.push(`${tag}: the wizard is inside an inert subtree`);
  await wiz('Cancel');
  await p.waitForSelector(cover, { timeout: 2000 }).catch(() => problems.push(`${tag}: cancelling the wizard did not return to Game Over`));
  await p.click(`${cover} button:text-is("New game")`);
  await newGame('Pip Again');
  await p.waitForTimeout(300);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) problems.push(`${tag}: New game from Game Over asked to replace`);
  if (await p.isVisible(cover)) problems.push(`${tag}: Game Over still shown after a new game`);
  await shot('67-after-game-over-new-game.png', p);
  await p.waitForTimeout(1500);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1000);
  if (await p.isVisible(cover)) problems.push(`${tag}: Game Over came back after reloading the new game`);
  await ctx.close();
}

// 19. The Tables pane: search, read and roll on reference tables from the fixture; chain to another
// table by its code and come Back; the state survives switching tabs; rolls add no History step;
// d66 has no modifier, a list has no roll; removing the table file leaves an explanation.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'tables';
  const pane = '.tables-pane';
  const wiz = (t) => p.click(`[role=dialog][aria-labelledby=wizard-title] button:text-is("${t}")`);
  const menu = () => p.click('header.toolbar button[aria-label="Menu"]');
  const undoText = async () => (await p.textContent('header.toolbar button.history'))?.trim() ?? '';
  const toolbarHeight = () => p.$eval('header.toolbar', (e) => e.getBoundingClientRect().height);
  const resultText = async () => ((await p.textContent(`${pane} [data-testid=ref-result]`).catch(() => null)) ?? '').replace(/\s+/g, ' ').trim();
  const hitRow = () => p.$$eval(`${pane} tbody tr`, (rows) => rows.findIndex((r) => r.classList.contains('hit')));
  // The dice are the floating roller's: its Dice button opens it, "Enter my roll" types, its Roll button rolls.
  const panel = '[data-testid=dice-panel]';
  const rollerOpen = async () => {
    if (!(await p.isVisible(panel))) await p.click('header.toolbar button[aria-label="Dice"]');
    await p.waitForSelector(panel);
  };
  const enterMode = async (on) => {
    await rollerOpen();
    await setRealDice(p, on);
  };
  const typedBoxes = `${panel} [data-testid=dice-typed] input`;
  const useTyped = async (...vals) => {
    await enterMode(true);
    for (let i = 0; i < vals.length; i++) await p.fill(`:nth-match(${typedBoxes}, ${i + 1})`, String(vals[i]));
    await p.click(`${panel} [data-testid=dice-typed] button:text-is("Use these")`);
    await p.waitForTimeout(200);
  };
  const typeD6 = (v) => useTyped(v);
  // A table showing a result rolls again only from its own card button.
  const tableAgain = async () => {
    await p.click(`${pane} [data-testid=roll-card] button`);
    await p.waitForTimeout(150);
  };
  const typeAgain = async (...vals) => {
    await enterMode(true);
    await tableAgain();
    await useTyped(...vals);
  };
  const rollAgain = async () => {
    await enterMode(false);
    await tableAgain();
    await p.waitForTimeout(900);
  };
  const rollerRoll = async () => {
    await enterMode(false);
    await p.click(`${panel} button.roll`);
    await p.waitForTimeout(900);
  };
  const rollerFor = async () => ((await p.textContent(`${panel} [data-testid=dice-for] .for-text`).catch(() => null)) ?? '').replace(/\s+/g, ' ').trim();
  const setMod = async (t) => {
    await p.fill(`${panel} [data-testid=dice-mod]`, t);
    await p.waitForTimeout(100);
  };
  const smallButtons = async (where) => {
    const small = await p.$$eval(`${pane} button, ${pane} input`, (els) =>
      els.map((el) => ({ t: el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName, r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0 && (b.r.width < 44 || b.r.height < 44)).map((b) => `${b.t} ${b.r.width.toFixed(1)}×${b.r.height.toFixed(1)}`),
    );
    for (const b of small) problems.push(`${tag} ${where}: control too small: ${b}`);
  };

  // The toolbar with a Tables button still fits on one row at 1180 px ("Create hero" is the longest Hero label).
  const h0 = await toolbarHeight();
  console.log(`${tag}: toolbar height ${h0.toFixed(1)} with "Create hero"`);
  if (h0 > 70) problems.push(`${tag}: toolbar wraps at 1180 px (height ${h0})`);
  if (!(await p.isVisible('header.toolbar button.tables'))) problems.push(`${tag}: no Tables button`);
  // Worst case: both history buttons at their longest (they ellipsize at a max width) beside "Create hero".
  const saved = await p.$$eval('header.toolbar button.history .label', (els) => els.map((e) => e.textContent));
  await p.$$eval('header.toolbar button.history .label', (els) => els.forEach((e, i) => (e.textContent = `${i ? 'Redo' : 'Undo'} Start encounter and then some`)));
  const hWorst = await toolbarHeight();
  console.log(`${tag}: toolbar height ${hWorst.toFixed(1)} with long Undo and Redo labels`);
  if (hWorst > 70) problems.push(`${tag}: toolbar wraps at 1180 px with long Undo and Redo labels (height ${hWorst})`);
  await p.$$eval('header.toolbar button.history .label', (els, t) => els.forEach((e, i) => (e.textContent = t[i])), saved);

  // No table file: the pane explains.
  await p.click('header.toolbar button.tables');
  await p.waitForSelector(pane);
  const noFile = (await p.textContent(`${pane} [data-testid=tables-empty]`))?.trim() ?? '';
  if (!noFile.startsWith('No table file is loaded. Load your table file') || noFile.includes('Your table file has no reference tables')) problems.push(`${tag}: no-file text "${noFile}"`);
  await shot('70-tables-no-file.png', p);
  await p.click('header.toolbar button.tables'); // put it away
  await p.waitForTimeout(150);
  if (await p.isVisible(pane)) problems.push(`${tag}: second Tables tap did not close the pane`);

  // A hero (for the Hero tab), on the fixture tables, plus a made-up table whose row names dice amounts.
  const fx19 = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8'));
  fx19.tables.referenceTables.XX9 = { name: 'Made-up Pouch Table', group: 'generic', page: 99, dice: 'd6', columns: ['Roll', 'Result'], rows: [{ roll: '1-6', cells: ['A made-up pouch with 2D6 +10 SC and 4D6 +10 GC.'] }] };
  fx19.tables.referenceTables.XX8 = { name: 'Made-up Flask Table', group: 'generic', page: 98, dice: 'd6', columns: ['Roll', 'Result'], rows: [{ roll: '1-6', cells: ['Tonic of Brief Hush'] }] };
  await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fx19)) });
  await p.waitForTimeout(500);
  await menu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Next');
  await p.fill('[aria-labelledby=wizard-title] input[type=text]', 'Pip Reader');
  await wiz('Next');
  await p.click('.weapon:has-text("Practice Sword")');
  await p.click('.mtable .row:has-text("Wobbly Poke")');
  await p.click('.mtable .row:has-text("Gentle Swipe")');
  await wiz('Next');
  await p.click('.option:has-text("Padded Tablecloth")');
  await wiz('Next');
  await p.click('.option:has-text("Scroll of Mild Glow")');
  await wiz('Next');
  await wiz('Begin');
  await p.waitForTimeout(500);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(500);
  const h1 = await toolbarHeight();
  if (h1 > 70) problems.push(`${tag}: toolbar wraps at 1180 px with a hero (height ${h1})`);
  const undo0 = await undoText();

  // 1. Open Tables and search "practice".
  await p.click('header.toolbar button.tables');
  await p.waitForSelector(`${pane} input[type=search]`);
  await p.fill(`${pane} input[type=search]`, 'practice');
  await p.waitForTimeout(150);
  const listed = (await p.$$eval(`${pane} .list button`, (els) => els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim()))) ?? [];
  console.log(`${tag}: list ${JSON.stringify(listed)}`);
  const want = ['XX1 — Practice Crate Table · p. 7', 'Practice Shelf Contents · p. 12', 'XX3 — Practice Echo Table · p. 10', 'XX2 — Practice Trinket Table · p. 8', 'XX4 — Practice Puddle Table · p. 11', 'LIST1 — Practice Price List · p. 9'];
  if (JSON.stringify(listed) !== JSON.stringify(want)) problems.push(`${tag}: list ${JSON.stringify(listed)}`);
  await p.click(`${pane} .chips button:text-is("Loot")`);
  const loot = await p.$$eval(`${pane} .list button`, (els) => els.length);
  if (loot !== 1) problems.push(`${tag}: Loot chip shows ${loot} tables`);
  await p.click(`${pane} .chips button:text-is("All")`);
  await smallButtons('list');
  await shot('71-tables-list.png', p);

  // 2. XX1: a typed 1 with −2 is clamped ("counts as 1"); then a typed 2 with −1 lands on the first row.
  await p.click(`${pane} .list button:has-text("XX1 —")`);
  await p.waitForSelector(`${pane} .rolling`);
  if (await p.isVisible(`${pane} button:text-is("‹ Back")`)) problems.push(`${tag}: Back shown with nothing to go back to`);
  if (await p.isVisible(`${pane} .mod`)) problems.push(`${tag}: the pane still has its own modifier field`);
  // The card's Roll hands the roll to the roller: the table shows a result and highlights its row.
  await enterMode(false);
  await p.click(`${pane} [data-testid=roll-card] button:text-is("🎲 Roll")`);
  await p.waitForTimeout(900);
  if (!(await p.isVisible(`${pane} [data-testid=ref-result]`)) || (await hitRow()) < 0) problems.push(`${tag}: the card's Roll gave no result row (hit ${await hitRow()})`);
  console.log(`${tag}: card Roll "${await resultText()}"`);
  // With a result showing, the table lets go of the roller: other rolls can't move its row.
  if ((await rollerFor()) !== 'Free roll') problems.push(`${tag}: after a result the roller is for "${await rollerFor()}"`);
  await enterMode(true);
  await tableAgain();
  if (!(await rollerFor()).startsWith('XX1 Practice Crate Table · D6')) problems.push(`${tag}: the card's button did not aim the roller ("${await rollerFor()}")`);
  await p.click(`${panel} button[aria-label="Modifier down"]`);
  await p.click(`${panel} button[aria-label="Modifier down"]`);
  await typeD6(1);
  let r = await resultText();
  console.log(`${tag}: XX1 result "${r}"`);
  if (!r.startsWith('1 − 2 = −1 · counts as 1')) problems.push(`${tag}: clamped result "${r}"`);
  if ((await hitRow()) !== 0) problems.push(`${tag}: clamped roll highlights row ${await hitRow()}`);
  await shot('72-xx1-clamped.png', p);
  await tableAgain();
  await setMod('-1');
  await typeD6(2);
  r = await resultText();
  if (!r.startsWith('2 − 1 = 1') || r.includes('counts as')) problems.push(`${tag}: XX1 result "${r}"`);
  if (!r.includes('Nothing but straw.')) problems.push(`${tag}: row text not repeated under the dice: "${r}"`);
  if ((await hitRow()) !== 0) problems.push(`${tag}: typed 2 −1 highlights row ${await hitRow()}`);
  await smallButtons('XX1');
  const squashed = await p.$eval(`${pane} .scroll`, (e) => e.clientHeight + 1 < e.scrollHeight);
  if (squashed) problems.push(`${tag}: the table rows are cut off in the pane`);
  await shot('73-xx1-result.png', p);

  // 3. "XX2 +1" in a row opens XX2 with modifier 1 at the top of the pane; a total in a gap says so; an animated roll lands.
  const scrolled = await p.$eval(`${pane} .body`, (e) => { e.scrollTop = e.scrollHeight; return e.scrollTop; });
  console.log(`${tag}: pane body scrolled to ${scrolled} before opening XX2`);
  await p.click(`${pane} tbody button:text-is("XX2 +1")`);
  await p.waitForSelector(`${pane} h3:has-text("Practice Trinket Table")`);
  await p.waitForTimeout(100);
  const top2 = await p.$eval(`${pane} .body`, (e) => e.scrollTop);
  if (top2 !== 0) problems.push(`${tag}: XX2 opened scrolled to ${top2} (was ${scrolled})`);
  const mod2 = await p.inputValue(`${panel} [data-testid=dice-mod]`);
  if (mod2 !== '1') problems.push(`${tag}: XX2 opened with modifier "${mod2}"`);
  if (!(await p.isVisible(`${pane} button:text-is("‹ Back")`))) problems.push(`${tag}: no Back on XX2`);
  await useTyped(1, 3);
  r = await resultText();
  if (!r.startsWith('4 + 1 = 5') || !r.includes('No row for 5')) problems.push(`${tag}: gap result "${r}"`);
  if ((await hitRow()) !== -1) problems.push(`${tag}: a gap highlights row ${await hitRow()}`);
  await shot('74-xx2-gap.png', p);
  await rollAgain();
  r = await resultText();
  if (!/^\d+ \+ 1 = \d+/.test(r)) problems.push(`${tag}: animated roll result "${r}"`);
  console.log(`${tag}: XX2 rolled "${r}"`);

  // 4. Back returns to XX1 with its modifier and result.
  let freeResult = '';
  await p.click(`${pane} button:text-is("‹ Back")`);
  await p.waitForSelector(`${pane} h3:has-text("Practice Crate Table")`);
  r = await resultText();
  if (!r.startsWith('2 − 1 = 1')) problems.push(`${tag}: Back lost XX1's result ("${r}")`);
  // XX1 still shows its result, so the roller stays free.
  if ((await rollerFor()) !== 'Free roll') problems.push(`${tag}: after Back the roller is for "${await rollerFor()}"`);
  if ((await hitRow()) !== 0) problems.push(`${tag}: Back lost the highlight`);
  await shot('75-back-to-xx1.png', p);
  // A free D6 roll leaves the table's result and row alone.
  await rollerRoll();
  r = await resultText();
  console.log(`${tag}: after a free D6 "${r}"`);
  if (!r.startsWith('2 − 1 = 1') || (await hitRow()) !== 0) problems.push(`${tag}: a free roll moved XX1's result ("${r}", row ${await hitRow()})`);
  freeResult = r;

  // 5. The Hero tab and back: the pane keeps its state.
  await p.click('header.toolbar button.hero');
  await p.waitForTimeout(200);
  if (!(await p.isVisible('#side-tab-tables'))) problems.push(`${tag}: no Tables tab beside the Hero tab`);
  await p.click('#side-tab-hero');
  await p.waitForTimeout(150);
  if (await p.isVisible(pane)) problems.push(`${tag}: Tables pane still showing on the Hero tab`);
  await p.click('#side-tab-tables');
  await p.waitForSelector(pane);
  r = await resultText();
  if (!(await p.isVisible(`${pane} h3:has-text("Practice Crate Table")`)) || r !== freeResult) problems.push(`${tag}: switching tabs lost the table or result ("${r}")`);
  if ((await undoText()) !== undo0) problems.push(`${tag}: rolling added a History step ("${await undoText()}", was "${undo0}")`);

  // 6. A d66 table has no modifier field; 2 then 5 is 25.
  await p.click(`${pane} button:text-is("☰ List")`);
  await p.fill(`${pane} input[type=search]`, 'echo');
  await p.click(`${pane} .list button:has-text("XX3 —")`);
  await p.waitForSelector(`${pane} .rolling`);
  await rollerOpen();
  if (await p.isVisible(`${panel} [data-testid=dice-mod]`)) problems.push(`${tag}: d66 table shows a modifier field`);
  await useTyped(2, 5);
  r = await resultText();
  if (!r.startsWith('25') || !r.includes('Footsteps')) problems.push(`${tag}: d66 result "${r}"`);
  if ((await hitRow()) !== 1) problems.push(`${tag}: d66 highlights row ${await hitRow()}`);
  await shot('76-d66.png', p);

  // A d3 table is a D6 read in halves (1-2 = 1, 3-4 = 2, 5-6 = 3): a typed 7 is rejected, 4 reads 2, 5 reads 3.
  await p.click(`${pane} button:text-is("☰ List")`);
  await p.fill(`${pane} input[type=search]`, 'XX4');
  await p.click(`${pane} .list button:has-text("XX4 —")`);
  await p.waitForSelector(`${pane} .rolling`);
  await useTyped(7);
  if (!(await p.isVisible(`${panel} [data-testid=dice-typed] [role=alert]`))) problems.push(`${tag}: a typed 7 on a D3 was accepted`);
  await useTyped(4);
  r = await resultText();
  if (!r.startsWith('4 → 2') || (await hitRow()) !== 1) problems.push(`${tag}: d3 typed 4 gave "${r}" (row ${await hitRow()})`);
  await typeAgain(5);
  r = await resultText();
  console.log(`${tag}: d3 typed 5 → "${r}"`);
  if (!r.startsWith('5 → 3') || !r.includes('Surprisingly deep.')) problems.push(`${tag}: d3 result "${r}"`);
  await rollAgain();
  r = await resultText();
  const d3m = r.match(/^([1-6]) → ([1-3])\b/);
  if (!d3m || Math.ceil(Number(d3m[1]) / 2) !== Number(d3m[2])) problems.push(`${tag}: d3 animated roll "${r}"`);
  await shot('77-d3.png', p);

  // Dice amounts in a result are roll buttons: 4D6 +10 rolls four dice, the total shows beside it, the row stays.
  await p.click(`${pane} button:text-is("☰ List")`);
  await p.fill(`${pane} input[type=search]`, 'XX9');
  await p.click(`${pane} .list button:has-text("XX9 —")`);
  await p.waitForSelector(`${pane} .rolling`);
  await useTyped(3);
  await enterMode(false);
  await p.click(`${pane} [data-testid=ref-result] button:text-is("🎲 4D6 +10 GC")`);
  await p.waitForTimeout(900);
  const dieCount = await p.$$eval(`${panel} [data-testid=dice-result] .faces > *`, (e) => e.length);
  const amountFor = ((await p.textContent(`${panel} [data-testid=dice-history] li`)) ?? '').trim();
  const gc = Number(((await resultText()).match(/4D6 \+10 GC = (\d+)/) ?? [])[1]);
  console.log(`${tag}: amount "${amountFor}", ${dieCount} dice, total ${gc}`);
  if (dieCount !== 4) problems.push(`${tag}: 4D6 showed ${dieCount} dice`);
  if (!amountFor.startsWith('XX9 1-6 GC +10:')) problems.push(`${tag}: amount history line "${amountFor}"`);
  if (!(gc >= 14 && gc <= 34)) problems.push(`${tag}: 4D6 +10 total ${gc} ("${await resultText()}")`);
  if (!(await resultText()).startsWith('3') || (await hitRow()) !== 0) problems.push(`${tag}: rolling an amount moved the table ("${await resultText()}")`);
  await p.click(`${pane} [data-testid=ref-result] button:text-is("🎲 2D6 +10 SC")`);
  await p.waitForTimeout(900);
  if (!/2D6 \+10 SC = \d+/.test(await resultText()) || (await hitRow()) !== 0) problems.push(`${tag}: second amount "${await resultText()}"`);
  await smallButtons('amounts');
  await shot('77a-amounts.png', p);
  // The totals outlast the pane: put it away (as going to the hero does) and bring it back.
  const bothTotals = (await resultText()).match(/= \d+/g)?.join(' ');
  await p.click('header.toolbar button.tables');
  await p.waitForTimeout(200);
  await p.click('header.toolbar button.tables');
  await p.waitForSelector(`${pane} [data-testid=ref-result]`);
  const totalsBack = (await resultText()).match(/= \d+/g)?.join(' ');
  console.log(`${tag}: amount totals "${bothTotals}", after reopening "${totalsBack}"`);
  if (!bothTotals || totalsBack !== bothTotals) problems.push(`${tag}: amount totals "${bothTotals}" were "${totalsBack}" after reopening the pane`);

  // A potion rolled on a table, added to the hero, stays added after a trip to the Hero tab (no second Add button).
  await p.click(`${pane} button:text-is("☰ List")`);
  await p.fill(`${pane} input[type=search]`, 'XX8');
  await p.click(`${pane} .list button:has-text("XX8 —")`);
  await p.waitForSelector(`${pane} .rolling`);
  await useTyped(2);
  await enterMode(false);
  await p.click(`${pane} [data-testid=add-potion] button:text-is("Add Tonic of Brief Hush to hero")`);
  await p.waitForTimeout(200);
  const addedLine = ((await p.textContent(`${pane} [data-testid=add-potion]`)) ?? '').trim();
  await p.click('#side-tab-hero');
  await p.waitForTimeout(150);
  if (await p.isVisible(pane)) problems.push(`${tag}: Tables pane still showing on the Hero tab (potion)`);
  await p.click('#side-tab-tables');
  await p.waitForSelector(`${pane} [data-testid=add-potion]`);
  const addedBack = ((await p.textContent(`${pane} [data-testid=add-potion]`)) ?? '').trim();
  console.log(`${tag}: potion "${addedLine}", after the Hero tab "${addedBack}"`);
  if (!addedLine.startsWith('Added Tonic of Brief Hush') || addedBack !== addedLine) problems.push(`${tag}: potion "${addedLine}" was "${addedBack}" after the Hero tab`);

  // 7. A list has no Roll button.
  await p.click(`${pane} button:text-is("☰ List")`);
  await p.fill(`${pane} input[type=search]`, '');
  await p.click(`${pane} .list button:has-text("LIST1 —")`);
  await p.waitForSelector(`${pane} h3:has-text("Practice Price List")`);
  if (await p.isVisible(`${pane} .rolling`)) problems.push(`${tag}: a list shows dice`);
  if (await p.isVisible(`${pane} button:has-text("Roll for me")`)) problems.push(`${tag}: a list has a Roll button`);
  await shot('78-list-table.png', p);

  // 8. Remove the table file: the explanation shows; the toolbar still works.
  await menu();
  await p.click('.menu [data-status="tables"] button:text-is("Remove")');
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  if (await p.isVisible('.menu')) await p.click('.backdrop', { position: { x: 5, y: 5 } });
  await p.waitForTimeout(150);
  if (!(await p.isVisible(`${pane} [data-testid=tables-empty]`))) problems.push(`${tag}: no explanation after removing the table file`);
  await shot('79-tables-removed.png', p);

  // 9. God and herb cards from the card pack: chips of their own (even with no table file), a picture grid,
  // full screen on a tap (fitting the screen), found by an All search; the encounter picker leaves them out.
  const cardImg = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 700;
    c.height = 968;
    const g = c.getContext('2d');
    g.fillStyle = '#b9a';
    g.fillRect(0, 0, 700, 968);
    g.strokeStyle = '#222';
    g.lineWidth = 16;
    g.strokeRect(16, 16, 668, 936);
    return c.toDataURL('image/png');
  });
  const godPack = { format: 1, systemId: 'dungeon', name: 'Made-up cards', cards: [
    { id: 'c1', name: 'Mossy Gribbler', level: 1, image: cardImg },
    { id: 'g1', name: 'Zorbin the Hollow', level: 0, kind: 'god', image: cardImg },
    { id: 'g2', name: 'Pell the Quiet', level: 0, kind: 'god', image: cardImg },
    { id: 'h1', name: 'Fizzleroot', level: 0, kind: 'herb', image: cardImg },
  ] };
  await p.setInputFiles('input[data-extra="cards"]', { name: 'cards.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(godPack)) });
  await p.waitForTimeout(500);
  const chipText = await p.$$eval(`${pane} .chips button`, (b) => b.map((x) => x.textContent.trim()).join('|'));
  if (chipText !== 'All|Gods|Herbs') problems.push(`${tag}: chips with cards and no table file "${chipText}"`);
  const cardNames = () => p.$$eval(`${pane} .cards .card span`, (b) => b.map((x) => x.textContent.trim()).join('|'));
  await p.click(`${pane} .chips button:text-is("Gods")`);
  if ((await cardNames()) !== 'Zorbin the Hollow|Pell the Quiet') problems.push(`${tag}: Gods shows "${await cardNames()}"`);
  await shot('79a-gods.png', p);
  await p.click(`${pane} .chips button:text-is("Herbs")`);
  if ((await cardNames()) !== 'Fizzleroot') problems.push(`${tag}: Herbs shows "${await cardNames()}"`);
  await p.click(`${pane} .cards .card`);
  await p.waitForSelector('.full img');
  const godFits = await p.$eval('.full img', (e) => {
    const r = e.getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  });
  if (!godFits) problems.push(`${tag}: full-screen herb card runs off the screen`);
  await shot('79b-herb-full.png', p);
  await p.keyboard.press('Escape');
  if (await p.isVisible('.full')) problems.push(`${tag}: full-screen herb card did not close on Escape`);
  await p.click(`${pane} .chips button:text-is("All")`);
  await p.fill(`${pane} input[type=search]`, 'the');
  if ((await cardNames()) !== 'Zorbin the Hollow|Pell the Quiet') problems.push(`${tag}: All search "the" shows "${await cardNames()}"`);
  await p.fill(`${pane} input[type=search]`, 'gribbler');
  if ((await cardNames()) !== '') problems.push(`${tag}: a creature card shows in the Tables pane`);
  await smallButtons('cards');
  await ctx.close();
}

// 20. Opening reference tables from text: a room's encounter text names XX1 -1 and a Victory treasure
// line names XX2 +1; each is a button that opens the Tables pane on that table with its modifier,
// and the fight stays untouched. The modifier field keeps what is typed until it loses focus.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'open table';
  const tap = async (x, y) => {
    const at = await p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(150);
  };
  const btn = (name) => p.click(`aside.panel button:text-is("${name}")`);
  const wiz = (t) => p.click(`[role=dialog][aria-labelledby=wizard-title] button:text-is("${t}")`);
  const menu = () => p.click('header.toolbar button[aria-label="Menu"]');
  const enc = '.encounter-pane';
  const tp = '.tables-pane';
  const dicePanel = '[data-testid=dice-panel]';
  const ENC = 'Made-up: a GRUMBLER sits by a crate, see XX1 -1 or practice-shelf.';
  const fx = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8'));
  const swap = (v) => {
    if (Array.isArray(v)) v.forEach(swap);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) k === 'encounter' && typeof v[k] === 'string' ? (v[k] = ENC) : swap(v[k]);
  };
  swap(fx.tables.dungeonLevels);
  fx.tables.creatures.Grumbler.treasure = 'Made-up: a pouch of pebbles; roll on XX2 +1.';
  // PRAC1 is both a creature table and a reference table; XX1's last row names it.
  fx.tables.referenceTables.PRAC1 = { ...fx.tables.referenceTables.XX4, name: 'Practice Both Table' };
  fx.tables.referenceTables.XX1.rows[3].cells = ['A made-up trinket. Or PRAC1.'];
  await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fx)) });
  await p.waitForTimeout(500);
  await menu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Next');
  await p.fill('[aria-labelledby=wizard-title] input[type=text]', 'Pip Open');
  await wiz('Next');
  await p.click('.weapon:has-text("Practice Sword")');
  await p.click('.mtable .row:has-text("Wobbly Poke")');
  await p.click('.mtable .row:has-text("Gentle Swipe")');
  await wiz('Next');
  await p.click('.option:has-text("Padded Tablecloth")');
  await wiz('Next');
  await p.click('.option:has-text("Scroll of Mild Glow")');
  await wiz('Next');
  await wiz('Begin');
  await p.waitForTimeout(500);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(800);
  await tap(12.5, 25.5);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await btn('Done');
  await btn('Done');
  await p.waitForTimeout(1500);
  await tap(12.5, 20);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await rollerEnterOn(p, '4');
  await rollerEnterOn(p, '3');
  await btn('Done');
  await rollerEnterOn(p, '3', '4');
  await p.waitForSelector('aside.panel [data-testid=encounter-actions]');
  const labels = await p.$$eval('aside.panel [data-testid=encounter-actions] button', (els) => els.map((e) => e.textContent.trim()));
  console.log(`${tag}: buttons ${JSON.stringify(labels)}`);
  if (labels.join('|') !== '⚔ Fight Grumbler|📖 Open XX1 −1') problems.push(`${tag}: buttons ${JSON.stringify(labels)}`);
  const small = await p.$$eval('aside.panel [data-testid=encounter-actions] button', (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  if (small) problems.push(`${tag}: ${small} buttons under 44 px`);
  await shot('80-table-button-in-text.png', p);

  // Start the fight (it places the room), go to its Room tab and open the table from the text.
  await p.click('aside.panel button:text-is("⚔ Fight Grumbler")');
  await p.waitForSelector(enc);
  const foesNow = () => p.$$eval(`${enc} .foe`, (els) => els.map((e) => `${e.querySelector('.name span')?.textContent?.trim()}:${e.querySelector('.num')?.textContent?.trim()}`));
  if ((await foesNow()).join('|') !== 'Grumbler:4') problems.push(`${tag}: fight ${JSON.stringify(await foesNow())}`);
  await p.click('#side-tab-room');
  await p.waitForSelector('[data-editor=room] [data-testid=encounter-actions]', { timeout: 3000 }).catch(() => problems.push(`${tag}: placed room shows no encounter buttons`));
  const undoBefore = (await p.textContent('header.toolbar button.history'))?.trim();
  await p.click('[data-editor=room] button:text-is("📖 Open XX1 −1")');
  await p.waitForSelector(`${tp} h3:has-text("Practice Crate Table")`);
  if (!(await p.isVisible(dicePanel))) await p.click('header.toolbar button[aria-label="Dice"]');
  await p.waitForSelector(dicePanel);
  const forText = ((await p.textContent(`${dicePanel} [data-testid=dice-for] .for-text`)) ?? '').replace(/\s+/g, ' ').trim();
  if (!forText.endsWith('· D6 −1') || !forText.includes('XX1')) problems.push(`${tag}: XX1 opened with For line "${forText}"`);
  if (await p.isVisible(`${tp} .mod`)) problems.push(`${tag}: the pane still has a modifier field`);
  if ((await p.getAttribute('#side-tab-tables', 'aria-selected')) !== 'true') problems.push(`${tag}: Tables tab not selected`);
  if ((await p.textContent('header.toolbar button.history'))?.trim() !== undoBefore) problems.push(`${tag}: opening a table added a History step`);
  await shot('81-table-opened-from-text.png', p);
  // A code that is a creature table too opens its reference table from inside the pane.
  await p.click(`${tp} tbody button:text-is("PRAC1")`);
  await p.waitForSelector(`${tp} h3:has-text("Practice Both Table")`);
  await p.click(`${tp} button:text-is("‹ Back")`);
  await p.waitForSelector(`${tp} h3:has-text("Practice Crate Table")`);

  // The modifier field: typing is not rewritten under the caret; every minus form works; blur tidies.
  const mod = `${dicePanel} [data-testid=dice-mod]`;
  await p.focus(mod);
  await p.fill(mod, '');
  await p.keyboard.type('-1');
  if ((await p.inputValue(mod)) !== '-1') problems.push(`${tag}: typing "-1" became "${await p.inputValue(mod)}"`);
  await p.fill(mod, '');
  await p.keyboard.type('+2');
  if ((await p.inputValue(mod)) !== '+2') problems.push(`${tag}: typing "+2" became "${await p.inputValue(mod)}"`);
  await p.fill(mod, '');
  await p.fill(mod, '−3'); // minus sign
  await p.fill(mod, '–2'); // en dash
  await p.click(`${tp} h3`); // blur
  if ((await p.inputValue(mod)) !== '−2') problems.push(`${tag}: en dash modifier gave "${await p.inputValue(mod)}"`);
  await p.fill(mod, '+2');
  await p.click(`${tp} h3`);
  if ((await p.inputValue(mod)) !== '2') problems.push(`${tag}: blur left "${await p.inputValue(mod)}"`);
  await p.fill(mod, '−3');
  await p.click(`${tp} h3`);
  if ((await p.inputValue(mod)) !== '−3') problems.push(`${tag}: U+2212 modifier gave "${await p.inputValue(mod)}"`);

  // The fight is untouched.
  await p.click('#side-tab-encounter');
  await p.waitForSelector(enc);
  if ((await foesNow()).join('|') !== 'Grumbler:4') problems.push(`${tag}: fight lost after opening a table: ${JSON.stringify(await foesNow())}`);

  // Win: the treasure line has a working button.
  await p.click(`${enc} .foe:has(.name span:text-is("Grumbler")) .num`);
  await p.fill(`${enc} .foe:has(.name span:text-is("Grumbler")) input`, '0');
  await p.keyboard.press('Enter');
  await p.waitForSelector(`${enc} .confirm.win`);
  await p.click(`${enc} .confirm.win button:text-is("Win the fight")`);
  await p.waitForSelector(`${enc} .victory`);
  const line = (await p.textContent(`${enc} [data-testid=treasure-line]`))?.replace(/\s+/g, ' ').trim();
  console.log(`${tag}: treasure "${line}"`);
  if (!line?.includes('📖 Open XX2 +1')) problems.push(`${tag}: treasure line "${line}"`);
  const smallV = await p.$$eval(`${enc} .victory button`, (els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  if (smallV) problems.push(`${tag}: ${smallV} Victory buttons under 44 px`);
  await shot('82-victory-table-button.png', p);
  await p.click(`${enc} .victory button:text-is("📖 Open XX2 +1")`);
  await p.waitForSelector(`${tp} h3:has-text("Practice Trinket Table")`);
  if ((await p.inputValue(`${dicePanel} [data-testid=dice-mod]`)) !== '1') problems.push(`${tag}: XX2 opened with modifier "${await p.inputValue(`${dicePanel} [data-testid=dice-mod]`)}"`);
  await shot('83-table-opened-from-victory.png', p);
  await p.click('#side-tab-encounter');
  await p.waitForSelector(`${enc} .victory`);
  // Done brings the room the hero stands in back to the front (its text may go on to a loot roll).
  await p.click(`${enc} .victory button:text-is("Done")`);
  await p.waitForTimeout(300);
  if ((await p.getAttribute('#side-tab-room', 'aria-selected')) !== 'true') problems.push(`${tag}: Room tab not in front after Done`);
  if (!(await p.isVisible('[data-editor=room]'))) problems.push(`${tag}: room text not shown after Done`);
  await shot('84-room-after-victory.png', p);
  await ctx.close();
}

// 21. Token drag: the token moves only by dragging it; taps on rooms and notes in Play show them.
// Entrance room x11–13 y21–24 (token at 12,22), open exits north (12,20), west and east.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'token drag';
  const screenAt = (x, y) =>
    p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
  const tap = async (x, y) => {
    const at = await screenAt(x, y);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(150);
  };
  const btn = (name) => p.click(`aside.panel button:text-is("${name}")`);
  const tool = (name) => p.click(`header.toolbar button.tool:text-is("${name}")`);
  const undo = async () => (await p.textContent('header.toolbar button.history'))?.replace(/\s+/g, ' ').trim() ?? '';
  const token = () => p.getAttribute('canvas', 'data-token');
  const dragCell = () => p.getAttribute('canvas', 'data-token-drag');
  /** Press at one world point and move (mouse) to another; the caller releases. */
  const pressAndMove = async (from, to) => {
    const a = await screenAt(...from);
    const b = await screenAt(...to);
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps: 8 });
    await p.waitForTimeout(100);
  };

  // No Select tool any more.
  const tools = await p.$$eval('header.toolbar button.tool', (els) => els.map((e) => e.textContent.trim()));
  console.log(`${tag}: tools ${tools.join(', ')}`);
  if (tools.join() !== 'Play,Door,Stairs,Note') problems.push(`${tag}: toolbar tools are ${tools.join(', ')}`);
  // A second click on Door, Stairs or Note goes back to Play; Play stays Play.
  const pressed = () => p.$$eval('header.toolbar button.tool[aria-pressed=true]', (els) => els.map((e) => e.textContent.trim()).join());
  for (const name of ['Door', 'Stairs', 'Note']) {
    await tool(name);
    if ((await pressed()) !== name) problems.push(`${tag}: after one click on ${name} the pressed tool is ${await pressed()}`);
    await tool(name);
    if ((await pressed()) !== 'Play') problems.push(`${tag}: a second click on ${name} left ${await pressed()} pressed`);
  }
  await tool('Play');
  if ((await pressed()) !== 'Play') problems.push(`${tag}: clicking Play in Play left ${await pressed()} pressed`);

  await tap(12.5, 25.5);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await btn('Done');
  await btn('Done');
  await p.waitForTimeout(1500);
  const start = await token();
  const undo0 = await undo();
  console.log(`${tag}: token at ${start}, ${undo0}`);
  if (start !== '12,22') problems.push(`${tag}: token starts at ${start}, expected 12,22`);

  // A plain click on a floor square opens the room inspector; the token stays put.
  await tap(12.5, 23.5);
  if (!(await p.isVisible('aside.panel [data-editor="room"]'))) problems.push(`${tag}: a floor click did not open the room inspector`);
  if ((await token()) !== start) problems.push(`${tag}: a floor click moved the token to ${await token()}`);
  if ((await undo()) !== undo0) problems.push(`${tag}: a floor click added an undo step: ${await undo()}`);
  await checkPanelOn(p, `${tag} inspector`);
  await shot('90-play-tap-room.png', p);
  await btn('Close');
  if (await p.isVisible('aside.panel [data-editor="room"]')) problems.push(`${tag}: Close left the inspector open`);
  if (!(await p.isVisible('aside.panel .hint'))) problems.push(`${tag}: Close did not bring back the step panel`);

  // A click on the token's own square is still a tap: the room inspector, no ghost, no move.
  await tap(12.5, 22.5);
  if (!(await p.isVisible('aside.panel [data-editor="room"]'))) problems.push(`${tag}: a click on the token did not open the room inspector`);
  if ((await token()) !== start || (await undo()) !== undo0) problems.push(`${tag}: a click on the token changed something (${await token()}, ${await undo()})`);
  await btn('Close');
  // A note on the token's square opens on a tap.
  await tool('Note');
  await tap(12.5, 22.5);
  await p.fill('aside.panel textarea', 'Invented footprints');
  await btn('Add note');
  await tool('Play');
  await tap(12.5, 22.5);
  if (!(await p.isVisible('aside.panel [data-editor="note"]'))) problems.push(`${tag}: a tap on a note under the token did not open the note editor`);
  await p.click('header.toolbar button.history'); // the note goes again
  await p.waitForTimeout(300);
  // An open exit right beside the token: stand on the west exit square (10,22) and tap the exit edge.
  {
    const a = await screenAt(12.5, 22.5);
    const b = await screenAt(10.5, 22.5);
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(800);
  }
  if ((await token()) !== '10,22') problems.push(`${tag}: token did not walk onto the west exit square (${await token()})`);
  await tap(10.15, 22.5);
  const exitStep = await p.getAttribute('aside.panel .body', 'data-step');
  if (exitStep !== 'size') problems.push(`${tag}: a tap on the exit beside the token gave step ${exitStep}`);
  await shot('95-exit-tap-beside-token.png', p);
  if (exitStep === 'size') await btn('Cancel');
  await p.waitForTimeout(200);
  await p.click('header.toolbar button.history'); // back to 12,22
  await p.waitForTimeout(300);
  if ((await token()) !== start || (await undo()) !== undo0) problems.push(`${tag}: undoing the exit-square walk gave ${await token()} / ${await undo()}`);
  // Gap mode: the token can't be dragged.
  await btn('Fill gap with corridor');
  {
    const a = await screenAt(12.5, 22.5);
    const b = await screenAt(12.5, 24.5);
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps: 8 });
    if (await dragCell()) problems.push(`${tag}: token drag started in gap mode`);
    await p.mouse.up();
    await p.waitForTimeout(300);
  }
  if ((await token()) !== start) problems.push(`${tag}: gap-mode drag moved the token to ${await token()}`);
  await btn('Cancel corridor');

  // Mouse drag to a valid square: highlighted ok while dragging, walks on release.
  await pressAndMove([12.5, 22.5], [13.5, 24.5]);
  if ((await dragCell()) !== '13,24') problems.push(`${tag}: dragging over 13,24 reports ${await dragCell()}`);
  await shot('91-token-drag-valid.png', p);
  await p.mouse.up();
  await p.waitForTimeout(800);
  console.log(`${tag}: after valid drop token ${await token()}, ${await undo()}`);
  if ((await token()) !== '13,24') problems.push(`${tag}: valid drop left the token at ${await token()}`);
  if (!(await undo()).includes('Move token')) problems.push(`${tag}: undo after the walk reads "${await undo()}"`);
  if (await dragCell()) problems.push(`${tag}: drag highlight still set after the drop`);

  // Drop on empty space: highlighted bad, nothing changes (one Undo still goes back to the entrance).
  await pressAndMove([13.5, 24.5], [5.5, 5.5]);
  await shot('92-token-drag-invalid.png', p);
  await p.mouse.up();
  await p.waitForTimeout(500);
  if ((await token()) !== '13,24') problems.push(`${tag}: invalid drop moved the token to ${await token()}`);
  // Off the map entirely, and onto the token's own square: nothing either.
  await pressAndMove([13.5, 24.5], [40, 40]);
  await p.mouse.up();
  await pressAndMove([13.5, 24.5], [13.6, 24.6]);
  await p.mouse.up();
  await p.waitForTimeout(300);
  if ((await token()) !== '13,24') problems.push(`${tag}: off-map or same-square drop moved the token to ${await token()}`);
  if (!(await undo()).includes('Move token')) problems.push(`${tag}: undo label after invalid drops "${await undo()}"`);

  // Escape mid-drag cancels: releasing over a valid square afterwards does nothing.
  await pressAndMove([13.5, 24.5], [11.5, 24.5]);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  if (await dragCell()) problems.push(`${tag}: Escape did not end the drag`);
  await p.mouse.up();
  await p.waitForTimeout(300);
  if ((await token()) !== '13,24') problems.push(`${tag}: Escape then release moved the token to ${await token()}`);

  // Exactly one undo step from all of the above.
  await p.click('header.toolbar button.history');
  await p.waitForTimeout(300);
  if ((await token()) !== start || (await undo()) !== undo0) problems.push(`${tag}: one Undo gives token ${await token()} / "${await undo()}"`);
  await p.click('header.toolbar button.history >> nth=1');
  await p.waitForTimeout(300);
  if ((await token()) !== '13,24') problems.push(`${tag}: Redo gives token ${await token()}`);

  // A drag from empty floor still pans; the token stays put.
  const cam0 = await p.getAttribute('canvas', 'data-camera');
  await pressAndMove([11.5, 21.5], [6.5, 16.5]);
  await p.mouse.up();
  await p.waitForTimeout(200);
  if ((await p.getAttribute('canvas', 'data-camera')) === cam0) problems.push(`${tag}: dragging empty floor did not pan`);
  if ((await token()) !== '13,24') problems.push(`${tag}: panning moved the token`);

  // A note pin tapped in Play opens the note editor; Undo removes the note and the panel goes back.
  await tool('Note');
  await tap(11.5, 24.5);
  await p.fill('aside.panel textarea', 'Half-written');
  await tool('Note'); // second click: back to Play, the draft goes
  if (await p.isVisible('aside.panel [data-editor="note"]')) problems.push(`${tag}: second Note click left the note draft open`);
  if ((await pressed()) !== 'Play') problems.push(`${tag}: second Note click with a draft left ${await pressed()} pressed`);
  await tool('Note');
  await tap(11.5, 24.5);
  await p.fill('aside.panel textarea', 'Invented scratches');
  await btn('Add note');
  await tool('Play');
  await tap(11.5, 24.5);
  if (!(await p.isVisible('aside.panel [data-editor="note"]'))) problems.push(`${tag}: a note tap in Play did not open the note editor`);
  await checkPanelOn(p, `${tag} note`);
  await shot('93-play-tap-note.png', p);
  await p.click('header.toolbar button.history');
  await p.waitForTimeout(300);
  if (await p.isVisible('aside.panel [data-editor="note"]')) problems.push(`${tag}: note editor still open after undoing the note`);

  // Starting a room while the inspector shows: the steps take the panel.
  await tap(12.5, 23.5);
  await tap(12.5, 20);
  const stepNow = await p.getAttribute('aside.panel .body', 'data-step');
  if (stepNow !== 'size') problems.push(`${tag}: exit tap with the inspector open gave step ${stepNow}`);
  if (await p.isVisible('aside.panel [data-editor="room"]')) problems.push(`${tag}: inspector still shown while placing a room`);
  // While a room is placed, the token can't be dragged.
  await pressAndMove([13.5, 24.5], [11.5, 23.5]);
  if (await dragCell()) problems.push(`${tag}: token drag started while placing a room`);
  await p.mouse.up();
  await btn('Cancel');
  await p.waitForTimeout(200);

  // Touch: a one-finger drag walks; a second finger mid-drag cancels.
  const touch = async (steps) => {
    await p.$eval('canvas', (c, st) => {
      c.setPointerCapture = () => {};
      for (const [type, id, pt] of st) {
        c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 7, bubbles: true, clientX: pt.x, clientY: pt.y, buttons: type === 'pointerup' ? 0 : 1, button: 0 }));
      }
    }, steps);
    await p.waitForTimeout(600);
  };
  const t0 = await screenAt(13.5, 24.5);
  const t1 = await screenAt(12.5, 23.5);
  const mid = { x: (t0.x + t1.x) / 2, y: (t0.y + t1.y) / 2 };
  await touch([['pointerdown', 7, t0], ['pointermove', 7, mid], ['pointermove', 7, t1], ['pointerup', 7, t1]]);
  if ((await token()) !== '12,23') problems.push(`${tag}: touch drag left the token at ${await token()}`);
  const t2 = await screenAt(12.5, 23.5);
  const t3 = await screenAt(11.5, 21.5);
  const far = await screenAt(16.5, 16.5);
  await touch([['pointerdown', 7, t2], ['pointermove', 7, t3], ['pointerdown', 8, far], ['pointermove', 8, { x: far.x + 30, y: far.y }], ['pointerup', 8, far], ['pointerup', 7, t3]]);
  if ((await token()) !== '12,23') problems.push(`${tag}: a second finger did not cancel the drag (token ${await token()})`);
  await shot('94-token-touch.png', p);
  await ctx.close();
}

// Room labels: always inside their own room (wrapped, or the number alone as a badge), clear of
// note pins and stairs, and drawn above footprints.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'room labels';
  await p.click('header.toolbar button[aria-label="Menu"]');
  await p.click('text=Load demo map');
  await p.waitForTimeout(800);
  const screenAt = (x, y) =>
    p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
  const rooms = () =>
    p.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('2d6-dungeon-companion', 1);
          r.onsuccess = () => {
            const g = r.result.transaction('saves').objectStore('saves').get('current');
            g.onsuccess = () => resolve(g.result.history.current.rooms.filter((o) => o.kind === 'room'));
            g.onerror = () => reject(g.error);
          };
          r.onerror = () => reject(r.error);
        }),
    );
  const centreOf = (o) => screenAt(o.x + o.w / 2, o.y + o.h / 2);
  // Crowd it: give two small rooms long names through the room inspector.
  const rename = async (from, to) => {
    await p.waitForTimeout(1500); // autosave
    const o = (await rooms()).find((r) => r.label.type === from);
    if (!o) return problems.push(`${tag}: demo has no room "${from}"`);
    const at = await centreOf(o);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(200);
    await p.fill('aside.panel [data-editor="room"] input[type="text"]', to);
    await p.click('aside.panel button:text-is("Save")');
    await p.waitForTimeout(200);
    await p.click('aside.panel button:text-is("Close")');
  };
  await rename('Store', 'Burrow of the Grey Hounds');
  await rename('Vault', 'Ossuary of Forgotten Saints');
  await rename('Shrine', 'Shrine of the Drowned Bell');
  await p.waitForTimeout(1500);
  await p.mouse.move(2, 2);
  await shot('95-labels-crowded.png', p);
  // No label covers a note pin or stairs (the demo has a note where the Crypt's label would centre).
  {
    const feats = await p.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('2d6-dungeon-companion', 1);
          r.onsuccess = () => {
            const g = r.result.transaction('saves').objectStore('saves').get('current');
            g.onsuccess = () => resolve(g.result.history.current.features);
            g.onerror = () => reject(g.error);
          };
          r.onerror = () => reject(r.error);
        }),
    );
    const zone = (f) => (f.kind === 'stairs' ? { x: f.x + 0.11, y: f.y + 0.14, w: 0.78, h: 0.72 } : { x: f.x + 0.34, y: f.y + 0.24, w: 0.32, h: 0.58 });
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const boxes = ((await p.getAttribute('canvas', 'data-labels')) ?? '').split(';').filter(Boolean).map((t) => {
      const [x, y, w, h] = t.split(':')[1].split(',').map(Number);
      return { id: t.split(':')[0], x, y, w, h };
    });
    let n = 0;
    for (const f of feats) for (const b of boxes) if (hit(zone(f), b)) problems.push(`${tag}: label of ${b.id} covers the ${f.kind} at ${f.x},${f.y}`), n++;
    console.log(`${tag}: ${boxes.length} labels, ${feats.length} features, ${n} covered`);
    if (!feats.some((f) => f.kind === 'note')) problems.push(`${tag}: demo has no note to check against`);
  }

  // Footprints never show through a label: a trail walked straight under a label leaves its
  // pixels exactly as they are with no trail, while the trail beside it is visible.
  await p.waitForTimeout(1500); // autosave
  const labels = ((await p.getAttribute('canvas', 'data-labels')) ?? '').split(';').map((t) => {
    const [roomId, r, badge] = t.split(':');
    const [x, y, w, h] = r.split(',').map(Number);
    return { roomId, x, y, w, h, badge: badge === 'badge' };
  });
  const roomsNow = await rooms();
  const target = labels
    .map((l) => ({ l, room: roomsNow.find((o) => o.id === l.roomId), row: Math.floor(l.y + l.h / 2) }))
    .find(({ l, room, row }) => room && !l.badge && l.y <= row + 0.3 && l.y + l.h >= row + 0.7 && room.w >= 3);
  if (!target) problems.push(`${tag}: no label suitable for the footprint check`);
  else {
    const { l, room, row } = target;
    const trail = [];
    for (let x = room.x; x < room.x + room.w; x++) trail.push({ x, y: row });
    // The token waits in a corner square off the label's row.
    const tokenAt = { x: room.x, y: row === room.y ? room.y + room.h - 1 : room.y };
    const setTrail = (cells) =>
      p.evaluate(
        ([tok, cells]) =>
          new Promise((resolve, reject) => {
            const r = indexedDB.open('2d6-dungeon-companion', 1);
            r.onsuccess = () => {
              const store = r.result.transaction('saves', 'readwrite').objectStore('saves');
              const g = store.get('current');
              g.onsuccess = () => {
                const rec = g.result;
                rec.history.current.token = { ...tok, trail: cells };
                const put = store.put(rec, 'current');
                put.onsuccess = () => resolve(null);
                put.onerror = () => reject(put.error);
              };
              g.onerror = () => reject(g.error);
            };
            r.onerror = () => reject(r.error);
          }),
        [tokenAt, cells],
      );
    const clips = async () => {
      await p.reload({ waitUntil: 'load' });
      await p.waitForTimeout(1200);
      await p.mouse.move(2, 2);
      const a = await screenAt(l.x, l.y);
      const b = await screenAt(l.x + l.w, l.y + l.h);
      const label = { x: a.x + 2, y: a.y + 2, width: b.x - a.x - 4, height: b.y - a.y - 4 };
      const ra = await screenAt(room.x, row);
      const rb = await screenAt(room.x + room.w, row + 1);
      const rowClip = { x: ra.x, y: ra.y, width: rb.x - ra.x, height: rb.y - ra.y };
      return { label: await p.screenshot({ clip: label }), row: await p.screenshot({ clip: rowClip }) };
    };
    await setTrail([]);
    const bare = await clips();
    await setTrail(trail);
    const walked = await clips();
    await shot('97-label-over-footprints.png', p);
    const labelSame = bare.label.equals(walked.label);
    const rowDiffers = !bare.row.equals(walked.row);
    console.log(`${tag}: trail under label of room ${room.number}: label pixels unchanged ${labelSame}, footprints visible beside it ${rowDiffers}`);
    if (!rowDiffers) problems.push(`${tag}: the footprint trail did not show at all (check is not testing anything)`);
    if (!labelSame) problems.push(`${tag}: footprints show through the label of room ${room.number}`);
  }
  await ctx.close();
}

// 22. The dice roller: the 🎲 toolbar button opens a floating panel over the map's top-right corner;
// each die rolls with the animated dice and totals ("= 9", "34" for D66); the last five rolls are
// listed; rolling adds no History step; the panel stays while switching sidebar tabs and while
// placing a room, and the map still pans outside it. "Roll a D6" in encounter text and "Roll a D3"
// in a reference table are buttons that open the panel on that die with one roll. × and 🎲 close it.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'dice';
  const panel = '[data-testid=dice-panel]';
  const diceBtn = 'header.toolbar button[aria-label="Dice"]';
  const ROLL_MS = 1700; // two dice: spin, stagger, hold
  const tap = async (x, y) => {
    const at = await p.$eval('canvas', (c, [wx, wy]) => {
      const [cx, cy, sc] = (c.dataset.camera ?? '').split(',').map(Number);
      const r = c.getBoundingClientRect();
      return { x: r.left + (wx - cx) * sc, y: r.top + (wy - cy) * sc };
    }, [x, y]);
    await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(150);
  };
  const btn = (name) => p.click(`aside.panel button:text-is("${name}")`);
  const wiz = (t) => p.click(`[role=dialog][aria-labelledby=wizard-title] button:text-is("${t}")`);
  const menu = () => p.click('header.toolbar button[aria-label="Menu"]');
  const undoText = async () => (await p.textContent('header.toolbar button.history'))?.trim() ?? '';
  const toolbarHeight = () => p.$eval('header.toolbar', (e) => e.getBoundingClientRect().height);
  const open = () => p.isVisible(panel);
  const chip = async () => (await p.$$eval(`${panel} .chips button[aria-pressed=true]`, (els) => els.map((e) => e.textContent?.trim()))).join('|');
  const total = async () => ((await p.textContent(`${panel} [data-testid=dice-total]`).catch(() => null)) ?? '').trim();
  const faces = () => p.$$eval(`${panel} [data-testid=dice-result] [role=img]`, (els) => els.length);
  const historyLines = async () => (await p.$$eval(`${panel} [data-testid=dice-history] li`, (els) => els.map((e) => e.textContent?.trim()))) ?? [];
  const rect = (sel) => p.$eval(sel, (e) => e.getBoundingClientRect().toJSON());

  const ENC = 'Made-up: a hollow rattle. Roll a D6. 1-4= Roll on XX1; on 5-6 nothing stirs.';
  const fx = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8'));
  const swap = (v) => {
    if (Array.isArray(v)) v.forEach(swap);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) k === 'encounter' && typeof v[k] === 'string' ? (v[k] = ENC) : swap(v[k]);
  };
  swap(fx.tables.dungeonLevels);
  fx.tables.referenceTables.XX1.rows[3].cells = ['A made-up trinket pile. Roll a D3 to count them.'];
  await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fx)) });
  await p.waitForTimeout(500);

  // The toolbar with 🎲 still fits on one row at 1180 px, also with the longest Undo and Redo labels.
  const h0 = await toolbarHeight();
  const saved = await p.$$eval('header.toolbar button.history .label', (els) => els.map((e) => e.textContent));
  await p.$$eval('header.toolbar button.history .label', (els) => els.forEach((e, i) => (e.textContent = `${i ? 'Redo' : 'Undo'} Start encounter and then some`)));
  const hWorst = await toolbarHeight();
  await p.$$eval('header.toolbar button.history .label', (els, t) => els.forEach((e, i) => (e.textContent = t[i])), saved);
  console.log(`${tag}: toolbar height ${h0.toFixed(1)}, ${hWorst.toFixed(1)} with long Undo and Redo labels`);
  if (h0 > 70 || hWorst > 70) problems.push(`${tag}: toolbar wraps at 1180 px with the Dice button (heights ${h0}, ${hWorst})`);
  const db = await rect(diceBtn);
  const tb = await rect('header.toolbar button.tables');
  if (db.width < 44 || db.height < 44) problems.push(`${tag}: Dice button ${db.width}×${db.height}`);
  if (!(db.left > tb.left && Math.abs(db.top - tb.top) < 2)) problems.push(`${tag}: Dice button is not right of Tables on the same row`);
  if (await open()) problems.push(`${tag}: panel open before the button was tapped`);

  // Open: over the map's top-right corner, not over the sidebar.
  await p.click(diceBtn);
  await p.waitForSelector(panel);
  if ((await p.getAttribute(diceBtn, 'aria-pressed')) !== 'true') problems.push(`${tag}: Dice button not pressed while open`);
  const pr = await rect(panel);
  const cr = await rect('canvas');
  const side = await rect('aside.panel');
  console.log(`${tag}: panel ${JSON.stringify({ l: pr.left, t: pr.top, r: pr.right, b: pr.bottom })} canvas right ${cr.right} top ${cr.top}`);
  if (pr.right > cr.right + 0.5 || pr.left < cr.left || pr.top < cr.top - 0.5 || pr.top > cr.top + 30 || cr.right - pr.right > 30) problems.push(`${tag}: panel is not in the map's top-right corner`);
  if (pr.right > side.left + 0.5) problems.push(`${tag}: panel covers the sidebar`);
  if ((await chip()) !== 'D6') problems.push(`${tag}: first open chose "${await chip()}"`);
  const forLine = async () => ((await p.textContent(`${panel} [data-testid=dice-for]`).catch(() => null)) ?? '').replace(/\s+/g, ' ').replace('×', '').trim();
  if ((await forLine()) !== 'Free roll') problems.push(`${tag}: For line "${await forLine()}" on first open`);
  await p.screenshot({ path: join(outDir, 'd1-dice-open.png') });
  console.log(`Saved ${join(outDir, 'd1-dice-open.png')}`);

  // Every die rolls; check the faces and the total's form.
  const undo0 = await undoText();
  const want = { D6: [1, /^= [1-6]$/], '2D6': [2, /^[1-6] \+ [1-6] = ([2-9]|1[0-2])$/], D66: [2, /^[1-6][1-6]$/], D3: [1, /^([1-6]) → ([1-3])$/] };
  for (const [label, [n, re]] of Object.entries(want)) {
    await p.click(`${panel} .chips button:text-is("${label}")`);
    if ((await chip()) !== label) problems.push(`${tag}: chip ${label} not highlighted ("${await chip()}")`);
    await p.click(`${panel} button.roll`);
    await p.waitForTimeout(200);
    if (!(await p.isDisabled(`${panel} button.roll`))) problems.push(`${tag}: Roll not disabled while ${label} spins`);
    await p.waitForTimeout(ROLL_MS);
    const t = await total();
    console.log(`${tag}: ${label} → ${t} (${await faces()} faces)`);
    if (!re.test(t)) problems.push(`${tag}: ${label} total "${t}"`);
    if (label === 'D3') {
      const [, face, d3] = t.match(re) ?? [];
      if (Math.ceil(Number(face) / 2) !== Number(d3)) problems.push(`${tag}: D3 read "${t}" (1-2 = 1, 3-4 = 2, 5-6 = 3)`);
      await shot('d3b-dice-d3.png', p);
    }
    if ((await faces()) !== n) problems.push(`${tag}: ${label} shows ${await faces()} dice`);
    if (label === '2D6') await shot('d2-dice-2d6.png', p);
    if (label === 'D66') await shot('d3-dice-d66.png', p);
  }
  // Two more: six rolls, five listed, newest first.
  await p.click(`${panel} .chips button:text-is("2D6")`);
  await p.click(`${panel} button.roll`);
  await p.waitForTimeout(ROLL_MS);
  await p.click(`${panel} button.roll`);
  await p.waitForTimeout(ROLL_MS);
  const hist = await historyLines();
  console.log(`${tag}: history ${JSON.stringify(hist)}`);
  if (hist.length !== 5) problems.push(`${tag}: history has ${hist.length} lines`);
  if (!/^Free 2D6: [1-6] \+ [1-6] = \d+$/.test(hist[0] ?? '') || !/^Free 2D6: /.test(hist[1] ?? '') || !/^Free D3: [1-6] → [1-3]$/.test(hist[2] ?? '') || !/^Free D66: [1-6][1-6]$/.test(hist[3] ?? '') || !/^Free 2D6: /.test(hist[4] ?? '')) problems.push(`${tag}: history ${JSON.stringify(hist)}`);
  const [a, b] = (hist[0] ?? '').match(/(\d) \+ (\d) = (\d+)/)?.slice(1, 4).map(Number) ?? [];
  if ((hist[0] ?? '').match(/= (\d+)$/)?.[1] !== String(a + b)) problems.push(`${tag}: 2D6 sum wrong in "${hist[0]}"`);
  if (!(hist[0] ?? '').endsWith(`: ${await total()}`)) problems.push(`${tag}: total "${await total()}" is not the newest history line "${hist[0]}"`);
  if ((await undoText()) !== undo0) problems.push(`${tag}: rolling added a History step ("${await undoText()}", was "${undo0}")`);
  const small = await p.$$eval(`${panel} button`, (els) => els.map((e) => ({ t: e.getAttribute('aria-label') ?? e.textContent?.trim(), r: e.getBoundingClientRect() })).filter((x) => x.r.width < 44 || x.r.height < 44).map((x) => `${x.t} ${x.r.width}×${x.r.height}`));
  for (const s of small) problems.push(`${tag}: panel button too small: ${s}`);
  await shot('d4-dice-history.png', p);

  // The map pans with a drag beside the panel (the panel only covers its own box); the panel stays.
  const cam0 = await p.getAttribute('canvas', 'data-camera');
  const from = { x: pr.left - 60, y: pr.top + 40 };
  const hitCanvas = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [from.x, from.y]);
  const hitPanel = await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid=dice-panel]'), [pr.left + 20, pr.top + 20]);
  if (hitCanvas !== 'CANVAS' || !hitPanel) problems.push(`${tag}: hit-testing beside/inside the panel gave ${hitCanvas} / ${hitPanel}`);
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(from.x - 120, from.y + 80, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(200);
  if ((await p.getAttribute('canvas', 'data-camera')) === cam0) problems.push(`${tag}: dragging the map beside the panel did not pan`);
  if (!(await open())) problems.push(`${tag}: panning the map closed the panel`);
  // A one-finger (touch pointer) drag beside the panel pans too.
  const cam1 = await p.getAttribute('canvas', 'data-camera');
  await p.$eval('canvas', (c, [a, b]) => {
    const fire = (type, q) => c.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: q.x, clientY: q.y, buttons: type === 'pointerup' ? 0 : 1, button: 0 }));
    c.setPointerCapture = () => {};
    fire('pointerdown', a);
    for (let i = 1; i <= 8; i++) fire('pointermove', { x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 });
    fire('pointerup', b);
  }, [from, { x: from.x - 80, y: from.y + 60 }]);
  await p.waitForTimeout(200);
  if ((await p.getAttribute('canvas', 'data-camera')) === cam1) problems.push(`${tag}: a one-finger drag beside the panel did not pan`);
  await p.click('header.toolbar button[aria-label="Menu"]');
  await p.click('[role=menuitem]:text-is("Fit map to screen")');
  await p.waitForTimeout(300);

  // A hero (the wizard covers everything; the panel is still there afterwards).
  await menu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Next');
  await p.fill('[aria-labelledby=wizard-title] input[type=text]', 'Pip Dicer');
  await wiz('Next');
  await p.click('.weapon:has-text("Practice Sword")');
  await p.click('.mtable .row:has-text("Wobbly Poke")');
  await p.click('.mtable .row:has-text("Gentle Swipe")');
  await wiz('Next');
  await p.click('.option:has-text("Padded Tablecloth")');
  await wiz('Next');
  await p.click('.option:has-text("Scroll of Mild Glow")');
  await wiz('Next');
  await wiz('Begin');
  await p.waitForTimeout(500);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(800);
  if (!(await open())) problems.push(`${tag}: panel closed by starting a new game`);

  // Sidebar tabs: Hero, Tables, back to Hero; the panel stays and keeps its history.
  const histBefore = JSON.stringify(await historyLines());
  await p.click('header.toolbar button.hero');
  await p.waitForTimeout(150);
  await p.click('header.toolbar button.tables');
  await p.waitForTimeout(150);
  await p.click('#side-tab-hero');
  await p.waitForTimeout(150);
  await p.click('#side-tab-tables');
  await p.waitForTimeout(150);
  if (!(await open())) problems.push(`${tag}: switching sidebar tabs closed the panel`);
  if (JSON.stringify(await historyLines()) !== histBefore) problems.push(`${tag}: switching tabs lost the roll history`);
  const pr2 = await rect(panel);
  const side2 = await rect('.side');
  if (pr2.right > side2.left + 0.5) problems.push(`${tag}: panel covers the wide sidebar`);
  await shot('d5-dice-with-tables.png', p);
  await p.click('header.toolbar button.tables'); // put the Tables pane away
  await p.click('header.toolbar button.hero'); // and the Hero panel
  await p.waitForTimeout(200);

  // Rooms: entrance, then room 2; while placing, the panel stays and still rolls.
  await tap(12.5, 25.5);
  await rollerEnterOn(p, '3', '4');
  await btn('Place');
  await btn('Done');
  await btn('Done');
  await p.waitForTimeout(1500);
  await tap(12.5, 20);
  await rollerEnterOn(p, '3', '4');
  if (!(await open())) problems.push(`${tag}: placing a room closed the panel`);
  if (await p.isDisabled(diceBtn)) problems.push(`${tag}: Dice button disabled while placing a room`);
  if (!(await p.isDisabled('header.toolbar button.tool:text-is("Door")'))) problems.push(`${tag}: Door enabled while placing (check is not testing placement)`);
  await rollerEnterModeOn(p, false); // this check rolls: the earlier typed steps left enter mode on
  await p.click(`${panel} .chips button:text-is("D6")`);
  await p.click(`${panel} button.roll`);
  await p.waitForTimeout(ROLL_MS);
  if (!/^= [1-6]$/.test(await total())) problems.push(`${tag}: rolling while placing gave "${await total()}"`);
  await shot('d6-dice-while-placing.png', p);
  await btn('Place');
  await rollerEnterOn(p, '4');
  await rollerEnterOn(p, '3');
  await btn('Done');
  await rollerEnterOn(p, '3', '4');
  await p.waitForSelector('aside.panel [data-testid=encounter-actions]');
  const labels = await p.$$eval('aside.panel [data-testid=encounter-actions] button', (els) => els.map((e) => e.textContent.trim()));
  console.log(`${tag}: encounter buttons ${JSON.stringify(labels)}`);
  if (labels.join('|') !== '🎲 Roll D6|📖 Open XX1') problems.push(`${tag}: encounter buttons ${JSON.stringify(labels)}`);
  const encText = (await p.textContent('aside.panel [data-testid=encounter-text] .enc-text'))?.trim();
  if (!encText?.endsWith(ENC)) problems.push(`${tag}: encounter text "${encText}"`);

  await rollerEnterModeOn(p, false);
  // Close with ×, choose 2D6 meanwhile, then "🎲 Roll D6" opens it on D6 with one roll.
  await p.click(`${panel} .chips button:text-is("2D6")`);
  await p.click(`${panel} button[aria-label="Close dice"]`);
  await p.waitForTimeout(150);
  if (await open()) problems.push(`${tag}: × did not close the panel`);
  if ((await p.getAttribute(diceBtn, 'aria-pressed')) !== 'false') problems.push(`${tag}: Dice button still pressed after ×`);
  const undo1 = await undoText();
  await p.click('aside.panel [data-testid=encounter-actions] button:text-is("🎲 Roll D6")');
  await p.waitForSelector(panel);
  await p.waitForTimeout(ROLL_MS);
  if ((await chip()) !== 'D6') problems.push(`${tag}: text button opened the panel on "${await chip()}"`);
  const fromText = await historyLines();
  console.log(`${tag}: after the text button ${JSON.stringify(fromText)} total ${await total()}`);
  if (fromText.length !== 5 || !/^Free D6: [1-6]$/.test(fromText[0] ?? '') || !/^= [1-6]$/.test(await total())) problems.push(`${tag}: text button roll ${JSON.stringify(fromText)} / "${await total()}"`);
  if ((await undoText()) !== undo1) problems.push(`${tag}: the text roll added a History step`);
  if ((await forLine()) !== 'Free roll') problems.push(`${tag}: For line "${await forLine()}" after a text button`);
  if (!/^Free D6:/.test(fromText[0] ?? '')) problems.push(`${tag}: history first line "${fromText[0]}" does not start with "Free D6:"`);
  await shot('d7-dice-from-encounter-text.png', p);
  // A second tap while open rolls again (one more line).
  await p.click('aside.panel [data-testid=encounter-actions] button:text-is("🎲 Roll D6")');
  await p.waitForTimeout(ROLL_MS);
  const afterSecond = await historyLines();
  if (afterSecond[1] !== fromText[0] || !/^Free D6: [1-6]$/.test(afterSecond[0] ?? '')) problems.push(`${tag}: second text tap gave ${JSON.stringify(afterSecond)}`);

  // Enter my roll: type a die, "Use these" records it as a free roll; 7 shows the roller's own error.
  const typedIn = `${panel} [data-testid=dice-typed] input`;
  if (!(await rollerEnterModeOn(p, true))) problems.push(`${tag}: real dice checkbox not ticked`);
  if (await p.isVisible(`${panel} button.roll`)) problems.push(`${tag}: Roll button still shown with real dice`);
  await p.fill(typedIn, '4');
  await p.click(`${panel} [data-testid=dice-typed] button:text-is("Use these")`);
  await p.waitForTimeout(150);
  if ((await historyLines())[0] !== 'Free D6: 4') problems.push(`${tag}: typed free roll gave ${JSON.stringify((await historyLines())[0])}`);
  await p.fill(typedIn, '7');
  await p.click(`${panel} [data-testid=dice-typed] button:text-is("Use these")`);
  await p.waitForTimeout(150);
  const typedErr = (await p.textContent(`${panel} [data-testid=dice-typed] [role=alert]`).catch(() => ''))?.trim();
  if (typedErr !== 'Type a number from 1 to 6.') problems.push(`${tag}: typed 7 gave "${typedErr}"`);
  if ((await historyLines())[0] !== 'Free D6: 4') problems.push(`${tag}: a rejected typed roll changed the history`);
  await p.fill(typedIn, '');
  if (await rollerEnterModeOn(p, false)) problems.push(`${tag}: real dice checkbox still ticked`);
  if ((await historyLines())[1] !== afterSecond[0]) problems.push(`${tag}: typed roll history is ${JSON.stringify(await historyLines())}`);

  // "Roll a D3" in a reference-table row is a button too.
  await p.click('aside.panel [data-testid=encounter-actions] button:text-is("📖 Open XX1")');
  await p.waitForSelector('.tables-pane h3:has-text("Practice Crate Table")');
  await p.click('.tables-pane tbody button:text-is("🎲 Roll D3")');
  await p.waitForTimeout(ROLL_MS);
  if ((await chip()) !== 'D3' || !/^Free D3: [1-6] → [1-3]$/.test((await historyLines())[0] ?? '')) problems.push(`${tag}: table D3 button gave chip "${await chip()}" / ${JSON.stringify(await historyLines())}`);
  const rowText = (await p.textContent('.tables-pane tbody tr:nth-child(4)'))?.replace(/\s+/g, ' ').trim();
  if (!rowText?.includes('A made-up trinket pile. 🎲 Roll D3 to count them.')) problems.push(`${tag}: table row "${rowText}"`);
  await shot('d8-dice-from-table.png', p);

  // The open state and die are remembered across a reload; 🎲 closes it.
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1200);
  if (!(await open()) || (await chip()) !== 'D3') problems.push(`${tag}: after reload open=${await open()} chip "${await chip().catch(() => '')}"`);
  await p.click(diceBtn);
  await p.waitForTimeout(150);
  if (await open()) problems.push(`${tag}: 🎲 did not close the panel`);
  if ((await p.getAttribute(diceBtn, 'aria-pressed')) !== 'false') problems.push(`${tag}: Dice button pressed while closed`);
  await shot('d9-dice-closed.png', p);
  await ctx.close();
}

// 23. Phone (390×844, dpr 3, touch): with a game running, a reference table open and the roller open,
// the roller covers at most about half the visible map, every roller control is 44 px or more, and
// the page does not scroll sideways.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const tag = 'phone';
  const panel = '[data-testid=dice-panel]';
  await p.setInputFiles('input[data-extra="tables"]', { name: 'tables.json', mimeType: 'application/json', buffer: Buffer.from(readFileSync('tests/fixtures/dungeon-tables.fixture.json')) });
  await p.waitForTimeout(500);
  await p.click('header.toolbar button.tables');
  await p.waitForSelector('.tables-pane');
  await p.click('header.toolbar button[aria-label="Dice"]');
  await p.waitForSelector(panel);
  await p.click(`${panel} button.roll`);
  await p.waitForTimeout(1200);
  await p.click(`${panel} button.roll`);
  await p.waitForTimeout(1200);
  const rect = (sel) => p.$eval(sel, (e) => e.getBoundingClientRect().toJSON());
  const pr = await rect(panel);
  const cr = await rect('canvas');
  const side = await rect('.shell > .side');
  const visTop = cr.top;
  const visBottom = Math.min(cr.bottom, side.top > visTop ? side.top : cr.bottom);
  const visibleArea = cr.width * Math.max(0, visBottom - visTop);
  const share = (pr.width * pr.height) / visibleArea;
  console.log(`${tag}: roller ${pr.width.toFixed(0)}×${pr.height.toFixed(0)} of map ${cr.width.toFixed(0)}×${(visBottom - visTop).toFixed(0)} (${(share * 100).toFixed(0)}%)`);
  if (share > 0.5) problems.push(`${tag}: roller covers ${(share * 100).toFixed(0)}% of the visible map (limit 50%)`);
  if (pr.left < cr.left || pr.right > cr.right + 0.5) problems.push(`${tag}: roller is wider than the map`);
  const small = await p.$$eval(`${panel} button, ${panel} input`, (els) =>
    els.map((el) => ({ t: el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName, r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0 && (b.r.width < 44 || b.r.height < 44)).map((b) => `${b.t} ${b.r.width.toFixed(1)}×${b.r.height.toFixed(1)}`),
  );
  for (const b of small) problems.push(`${tag}: roller control too small: ${b}`);
  await setRealDice(p, true);
  await p.waitForSelector(`${panel} [data-testid=dice-typed]`);
  const boxes = await p.$$eval(`${panel} [data-testid=dice-typed] input`, (els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  for (const b of boxes) if (b.width < 52 || b.height < 52) problems.push(`${tag}: typed box ${b.width.toFixed(1)}×${b.height.toFixed(1)} (want 52)`);
  const pr2 = await rect(panel);
  const share2 = (pr2.width * pr2.height) / visibleArea;
  if (share2 > 0.5) problems.push(`${tag}: roller with typed boxes covers ${(share2 * 100).toFixed(0)}% of the visible map`);
  const chipsTop = await rect(`${panel} .chips`);
  const modTop = await rect(`${panel} .modifier`);
  if (Math.abs(chipsTop.top - modTop.top) > 4) problems.push(`${tag}: chips and modifier are not on one row`);
  const histLines = await p.$$eval(`${panel} [data-testid=dice-history] li`, (els) => els.filter((e) => e.getBoundingClientRect().height > 0).length);
  if (histLines !== 1) problems.push(`${tag}: ${histLines} history lines shown (want 1)`);
  const scrollW = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (scrollW > 0) problems.push(`${tag}: page scrolls sideways by ${scrollW}px`);
  await p.screenshot({ path: join(outDir, 'phone-roller.png') });
  console.log(`Saved ${join(outDir, 'phone-roller.png')}`);
  await ctx.close();
}

await browser.close();
if (errors.length) problems.push('page errors:\n' + errors.join('\n'));
if (problems.length) {
  console.error('Visual check FAILED:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Visual check passed');
