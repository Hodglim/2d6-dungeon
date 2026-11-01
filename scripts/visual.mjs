// Usage: node scripts/visual.mjs <url> <outDir>
// Drives the app in headless Firefox at the reference tablet viewport (1180×820, dpr 2,
// touch), saves screenshots and asserts every toolbar and step-panel button is at least
// 44×44 CSS px. Plays an entrance plus a second room by tapping the map and typing dice,
// then uses the Door, Stairs, Note and Select tools on it.
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
await mainCtx.addInitScript(() => localStorage.setItem('2d6.installHintDismissed', '1'));
const page = await mainCtx.newPage();
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
          const r = indexedDB.open('2d6-map-maker', 1);
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
        const r = indexedDB.open('2d6-map-maker', 1);
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
  const fixture = readFileSync('tests/fixtures/dungeon-tables.fixture.json');
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
          const r = indexedDB.open('2d6-map-maker', 1);
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
  const runWizard = async (name, shots) => {
    await openMenu();
    await p.click('[role=menuitem]:text-is("New game…")');
    await wiz('Next');
    await p.fill('[aria-labelledby=wizard-title] input[type=text]', name);
    await wiz('Next');
    await p.click('.option:has-text("Practice Sword")');
    if (shots) await wshot('30-wizard-weapon.png');
    await wizSmall();
    await wiz('Next');
    if (await p.isEnabled('.next')) problems.push('wizard Next enabled with no manoeuvres chosen');
    await p.click('.option:has-text("Wobbly Poke")');
    await p.click('.option:has-text("Gentle Swipe")');
    if (shots) await wshot('31-wizard-manoeuvres.png');
    await wiz('Next');
    await p.click('.option:has-text("Padded Tablecloth")');
    await wiz('Next');
    await p.click('.option:has-text("Scroll of Mild Glow")');
    await wiz('Next');
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
  await p.click(`${panel} #hero-tab-items`);
  if ((await p.$$eval(`${panel} .slots li:not(.over) .grow:not(.empty)`, (e) => e.length)) !== 2) problems.push('Cancel did not leave the items alone');
  await p.fill(`${panel} [aria-label="New large item"]`, 'Anvil');
  await p.click(`${panel} .page form button:text-is("Add")`);
  await p.click(`${panel} [role=alert] button:text-is("Add anyway")`);
  if ((await p.$$eval(`${panel} .slots li`, (e) => e.length)) !== 3) problems.push('Add anyway did not add the item');
  await wshot('36-hero-items.png');
  await smallHero('items tab');

  // Level up, twice.
  if (!(await undoText()).includes('Add Anvil')) problems.push(`undo label after Add anyway: ${await undoText()}`);
  await p.click(`${panel} .offer button:text-is("Level up")`);
  if (!(await undoText()).includes('Level up to Explorer')) problems.push(`level-up label: ${await undoText()}`);
  if (!(await p.isVisible(`${panel} .offer:has-text("Level up to Seasoned Snoozer?")`))) problems.push('second level-up offer missing');
  await p.click(`${panel} .offer button:text-is("Level up")`);
  if (await p.isVisible(`${panel} .offer`)) problems.push('level-up offer still showing at the top level');

  // Stats page: manoeuvres offered from the loaded table file.
  await p.click(`${panel} #hero-tab-stats`);
  if (!(await p.isVisible(`${panel} button[aria-label="Add Grand Wave"]`))) problems.push('weapon manoeuvres not offered');
  await p.click(`${panel} button[aria-label="Add Cheerful Flourish"]`);
  if (await p.isVisible(`${panel} [role=alert]`)) problems.push('warning shown within the manoeuvre limit');
  await wshot('34-hero-stats.png');
  await smallHero('stats tab');

  await p.click(`${panel} #hero-tab-potions`);
  await p.click(`${panel} button[aria-label="Scraped Up box 2"]`);
  await p.click(`${panel} button[aria-label="Old Mossbeard favour box 3"]`);
  await wshot('35-hero-potions.png');
  await smallHero('potions tab');
  await p.click(`${panel} #hero-tab-story`);
  await p.fill(`${panel} textarea`, 'Found a very small door.');
  await p.click(`${panel} #hero-tab-items`);
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
        const c = document.createElement('canvas');
        c.width = 300;
        c.height = 420;
        const g = c.getContext('2d');
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
    await p.waitForSelector('.encounter-picker');
    if ((await p.$$eval('.encounter-picker .pick', (e) => e.length)) !== 3) problems.push('picker did not list 3 cards');
    const opts = await p.$$eval('.encounter-picker select option', (e) => e.map((o) => o.textContent.trim()));
    if (opts.join('|') !== 'All|Level 1|Level 2') problems.push('level filter options: ' + opts.join('|'));
    await p.selectOption('.encounter-picker select', '2');
    if ((await p.$$eval('.encounter-picker .pick', (e) => e.length)) !== 2) problems.push('level filter did not narrow');
    await p.fill('.encounter-picker input[type=search]', 'penny');
    if ((await p.$$eval('.encounter-picker .pick', (e) => e.length)) !== 1) problems.push('name search did not narrow');
    const histBefore = await undoText();
    await p.click('.encounter-picker .pick');
    await p.waitForSelector('.encounter-card img[alt="Tall Pennywort"]');
    if (await p.isVisible('.panel[aria-label="Step panel"]')) problems.push('step panel showing beside the encounter card');
    const fit = await p.$eval('.encounter-card img', (e) => e.getBoundingClientRect().width <= e.closest('.encounter-card').getBoundingClientRect().width);
    if (!fit) problems.push('card image wider than the panel');
    if ((await undoText()) !== histBefore) problems.push('picking a card changed History');
    await wshot('38-encounter.png');
    // Hero open too: tabs, Encounter first.
    await p.click('header.toolbar button.hero');
    await p.waitForSelector('.hero-panel');
    if (!(await p.isVisible('#side-tab-encounter')) || !(await p.isVisible('#side-tab-hero'))) problems.push('tabs missing with both open');
    await p.click('#side-tab-encounter');
    if (!(await p.isVisible('.encounter-card'))) problems.push('Encounter tab did not show the card');
    await p.click('#side-tab-hero');
    if (!(await p.isVisible('.hero-panel')) || (await p.isVisible('.encounter-card'))) problems.push('Hero tab did not switch');
    await wshot('39-encounter-hero-tabs.png');
    await p.click('#side-tab-encounter');
    // Full screen closes on tap and on Escape.
    await p.click('.encounter-card .image');
    if (!(await p.isVisible('.full img'))) problems.push('full-screen card missing');
    await p.click('.full');
    if (await p.isVisible('.full')) problems.push('full-screen card did not close on tap');
    await p.click('.encounter-card .image');
    await p.keyboard.press('Escape');
    if (await p.isVisible('.full')) problems.push('full-screen card did not close on Escape');
    await p.click('.encounter-card button:text-is("End encounter")');
    if (await p.isVisible('.encounter-card') || !(await p.isVisible('.hero-panel'))) problems.push('End encounter did not leave the hero panel');
    await p.click(`${panel} button[aria-label="Close hero panel"]`);
    if (!(await p.isVisible('.panel[aria-label="Step panel"]'))) problems.push('step panel did not return');
    // Not saved.
    await p.waitForTimeout(1200);
    if ((await readSaved()).includes('Tall Pennywort')) problems.push('encounter was saved');
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
  if (!(await p.isVisible('.hero-panel >> text=Load your table file to choose manoeuvres'))) problems.push('no-tables manoeuvre hint missing');

  // Typed text with no blur, then another edit, then a tab switch: both survive.
  await p.click('.hero-panel #hero-tab-story');
  await p.fill('.hero-panel textarea', 'typed before an HP tap');
  const hpNow = Number(await val('HP'));
  await p.evaluate(() => document.querySelector('.hero-panel [aria-label="HP down"]').click());
  await p.evaluate(() => document.querySelector('.hero-panel #hero-tab-items').click());
  await p.waitForTimeout(1500);
  const rebased = await readSaved();
  if (!rebased.includes('typed before an HP tap')) problems.push('typed narrative lost after another edit');
  if (Number(await val('HP')) !== hpNow - 1) problems.push('HP tap lost when rebasing typed text');

  // Teardown with typed text: New game without a hero while the Story tab is open must not crash.
  const errorsBefore = errors.length;
  await p.click('.hero-panel #hero-tab-story');
  await p.fill('.hero-panel textarea', 'typed, then the game goes away');
  await openMenu();
  await p.click('[role=menuitem]:text-is("New game…")');
  await wiz('Start without a hero');
  await p.waitForTimeout(300);
  if (await p.isVisible('[role=alertdialog] button:text-is("Replace")')) await p.click('[role=alertdialog] button:text-is("Replace")');
  await p.waitForTimeout(500);
  if (!(await p.isVisible('.panel[aria-label="Step panel"]'))) problems.push('step panel missing after the hero went away on the Story tab');
  if (await p.isVisible('.hero-panel')) problems.push('hero panel still showing with no hero');
  if (errors.length !== errorsBefore) problems.push('page error when the hero went away: ' + errors.slice(errorsBefore).join(' | '));
  await ctx.close();
}

await browser.close();
if (errors.length) problems.push('page errors:\n' + errors.join('\n'));
if (problems.length) {
  console.error('Visual check FAILED:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Visual check passed');
