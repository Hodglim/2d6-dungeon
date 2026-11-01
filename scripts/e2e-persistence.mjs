// Usage: node scripts/e2e-persistence.mjs   (BROWSER=webkit or chromium to override the default, firefox)
// Saving checks against `vite preview` of a fresh production build (port 4175), in headless Firefox:
//   1. entrance + room, reload: both still there, Undo works
//   2. act, then immediately hide the page (visibilitychange + pagehide) and reload: the last action is kept
//   3. export, import into a fresh browser context: same game, Undo disabled (no history)
//   4. import a corrupt file: a message appears, the game is unchanged
//   5. IndexedDB writes fail: the save banner appears and play continues
//   6. a damaged saved record: the blocking dialog shows, and Start new game (after confirming) clears it
// The service worker is blocked in every context so it can't interfere. Exits non-zero on any failure.
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as pw from 'playwright';

const browserType = pw[process.env.BROWSER ?? 'firefox'];

const PORT = 4175;
const URL_ = `http://localhost:${PORT}/`;
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!ok) failures.push(msg);
};

const built = spawnSync('node', ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'error'], { stdio: 'inherit' });
if (built.status !== 0) throw new Error('build failed');

const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
const stopPreview = () => preview.kill('SIGTERM');
await new Promise((resolve, reject) => {
  preview.once('exit', (c) => reject(new Error(`preview exited early (${c}); is port ${PORT} busy?`)));
  preview.stdout.on('data', (d) => /localhost/.test(String(d)) && resolve());
  setTimeout(() => reject(new Error('preview did not start')), 20000);
});
preview.removeAllListeners('exit');

let browser;
try {
  browser = await browserType.launch();
  const newCtx = async (init) => {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', acceptDownloads: true });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('2d6.installHintDismissed', '1');
      } catch {}
    });
    if (init) await ctx.addInitScript(init);
    return ctx;
  };
  const errors = [];
  const open = async (ctx) => {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForSelector('header.toolbar');
    await page.waitForFunction(() => !document.querySelector('[role=status]'), null, { timeout: 10000 }).catch(() => {});
    return page;
  };

  // ---- helpers ----
  const tapWorld = async (page, x, y) => {
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
  const stepIs = async (page, want, where) => {
    const got = await page.getAttribute('aside.panel .body', 'data-step');
    if (got !== want) throw new Error(`after ${where}: expected step "${want}", got "${got}"`);
  };
  const typeDice = async (page, ...values) => {
    const inputs = await page.$$('aside.panel form.dice input');
    for (let i = 0; i < values.length; i++) await inputs[i].fill(values[i]);
  };
  const panelButton = (page, name) => page.click(`aside.panel button:text-is("${name}")`);
  const undoText = async (page) => ((await page.textContent('header.toolbar button.history')) ?? '').replace(/\s+/g, ' ').trim();
  const coverage = async (page) => ((await page.textContent('header.toolbar .coverage')) ?? '').trim();

  const placeEntrance = async (page) => {
    await tapWorld(page, 12.5, 25.5);
    await stepIs(page, 'size', 'tapping the entrance square');
    await typeDice(page, '3', '4');
    await panelButton(page, 'Use these');
    await panelButton(page, 'Place');
    await stepIs(page, 'exits', 'placing the entrance');
    await panelButton(page, 'Done');
    await stepIs(page, 'label', 'entrance exits');
    await panelButton(page, 'Done');
    await stepIs(page, 'idle', 'entrance label');
    await page.waitForTimeout(1500); // the token walks in; a tap during the walk would only stop it
  };
  const placeRoom = async (page) => {
    await tapWorld(page, 12.5, 20); // north exit of the entrance room
    await stepIs(page, 'size', 'tapping the north exit');
    await typeDice(page, '4', '4');
    await panelButton(page, 'Use these');
    await typeDice(page, '2', '1');
    await panelButton(page, 'Use these');
    await stepIs(page, 'position', 'room dice');
    await panelButton(page, 'Place');
    await stepIs(page, 'exitCount', 'placing the room');
    await typeDice(page, '5');
    await panelButton(page, 'Use this');
    await page.click('aside.panel button:has-text("Wooden door")');
    await stepIs(page, 'exits', 'choosing doors');
    await tapWorld(page, 12.5, 15);
    await typeDice(page, '2');
    await panelButton(page, 'Place for me');
    await panelButton(page, 'Done');
    await stepIs(page, 'label', 'room exits');
    await page.fill('aside.panel input[type="text"]', 'Guard Room');
    await panelButton(page, 'Done');
    await stepIs(page, 'idle', 'room label');
    await page.waitForTimeout(2500);
  };
  const hide = (page) =>
    page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
  const reload = async (page) => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('header.toolbar');
    await page.waitForTimeout(800);
  };
  const exportViaMenu = async (page) => {
    await page.click('button[aria-label="Menu"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[role=menuitem]:text-is("Export game")')]);
    return { name: dl.suggestedFilename(), text: await readFile(await dl.path(), 'utf8') };
  };
  const importFile = async (page, name, text) => {
    await page.click('button[aria-label="Menu"]');
    await page.click('[role=menuitem]:text-is("Import game…")');
    await page.setInputFiles('input[type=file]', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.waitForTimeout(600);
  };

  // ---- 0. the service worker really is blocked ----
  {
    const ctx = await newCtx();
    const page = await open(ctx);
    await page.waitForTimeout(1500);
    const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length).catch(() => 0);
    check(regs === 0, `service worker is blocked (registrations: ${regs})`);
    await ctx.close();
  }

  // ---- 1. entrance + room survive a reload; Undo works ----
  let gameText;
  let coverageBefore;
  {
    const ctx = await newCtx();
    const page = await open(ctx);
    await placeEntrance(page);
    await placeRoom(page);
    coverageBefore = await coverage(page);
    check(coverageBefore !== '0%', `two rooms placed (coverage ${coverageBefore})`);
    await page.waitForTimeout(1800); // past the autosave debounce
    await reload(page);
    check((await coverage(page)) === coverageBefore, `after reload the map is back (coverage ${await coverage(page)})`);
    const u = await undoText(page);
    check(u.endsWith('Undo Add room') || /Undo/.test(u) && !(await page.isDisabled('header.toolbar button.history')), `Undo is available after reload ("${u}")`);
    await page.click('header.toolbar button.history');
    await page.waitForTimeout(300);
    check((await coverage(page)) !== coverageBefore, 'Undo after reload changes the map');
    // Redo to get the full game back for the export below.
    await page.click('header.toolbar button.history >> nth=1');
    await page.waitForTimeout(300);
    check((await coverage(page)) === coverageBefore, 'Redo restores the room');
    ({ text: gameText } = await exportViaMenu(page));

    // ---- 3. export (above) then import into a fresh context ----
    const ctx2 = await newCtx();
    const page2 = await open(ctx2);
    check((await coverage(page2)) === '0%', 'fresh context starts empty');
    await importFile(page2, '2d6-test.2d6map.json', gameText);
    check((await coverage(page2)) === coverageBefore, `imported game matches (coverage ${await coverage(page2)})`);
    check(await page2.isDisabled('header.toolbar button.history >> nth=0'), 'Undo is disabled after import (fresh history)');
    const again = await exportViaMenu(page2);
    check(again.text === gameText, 'exporting the imported game gives the same file');
    await page2.waitForTimeout(1800);
    await reload(page2);
    check((await coverage(page2)) === coverageBefore, 'imported game survives a reload');

    // ---- 4. a corrupt file leaves the game alone ----
    await importFile(page2, 'broken.json', '{ this is not json');
    const dlg = page2.locator('[role=alertdialog]');
    check((await dlg.count()) === 1 && /import/i.test((await dlg.textContent()) ?? ''), `corrupt import shows a message (${((await dlg.textContent()) ?? '').trim().slice(0, 80)})`);
    await page2.click('[role=alertdialog] button:text-is("OK")');
    check((await coverage(page2)) === coverageBefore, 'corrupt import leaves the game unchanged');
    // A valid campaign with a broken map is refused too.
    const bad = JSON.parse(gameText);
    const maps = bad.maps ?? bad.campaign?.maps;
    if (maps?.[0]) maps[0].rooms = 'nonsense';
    await importFile(page2, 'badmap.json', JSON.stringify(bad));
    const dlg2 = page2.locator('[role=alertdialog]');
    const refused = (await dlg2.count()) === 1 && /import/i.test((await dlg2.textContent()) ?? '');
    check(refused, 'a broken map is refused with a message');
    if (refused) await page2.click('[role=alertdialog] button:text-is("OK")');
    check((await coverage(page2)) === coverageBefore, 'broken-map import leaves the game unchanged');
    await ctx2.close();
    await ctx.close();
  }

  // ---- 2. act, hide immediately, reload: last action is kept ----
  {
    const ctx = await newCtx();
    const page = await open(ctx);
    await placeEntrance(page);
    await hide(page); // inside the debounce window
    await reload(page);
    check((await undoText(page)).endsWith('Undo Add entrance') && (await coverage(page)) !== '0%', `last action kept after hide + reload ("${await undoText(page)}")`);
    await ctx.close();
  }

  // ---- 5. IndexedDB writes fail: banner shows, play continues ----
  {
    const ctx = await newCtx(() => {
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('quota exceeded (test)', 'QuotaExceededError');
      };
    });
    const page = await open(ctx);
    await placeEntrance(page);
    await page.waitForTimeout(2000);
    const banner = page.locator('.banner[role=alert]');
    check((await banner.count()) === 1 && /Autosave isn't working/.test((await banner.textContent()) ?? ''), 'save banner appears when writes fail');
    await placeRoom(page);
    check((await undoText(page)).includes('Undo') && (await coverage(page)) !== '0%', 'play continues: a room can still be placed');
    await ctx.close();
  }

  // ---- 6. damaged record: blocking dialog; Start new game clears it ----
  {
    const ctx = await newCtx();
    const page = await open(ctx);
    await placeEntrance(page);
    await page.waitForTimeout(1800);
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('2d6-map-maker', 1);
          req.onsuccess = () => {
            const tx = req.result.transaction('saves', 'readwrite');
            tx.objectStore('saves').put({ garbage: true }, 'current');
            tx.oncomplete = () => resolve(null);
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        }),
    );
    // Stop the live page re-saving over the garbage when it is hidden/closed: reload straight away.
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[role=alertdialog]');
    const title = (await page.textContent('#load-error-title')) ?? '';
    check(/couldn't be loaded/.test(title), `blocking dialog shows for a damaged save ("${title}")`);
    await page.waitForTimeout(1500);
    const stillGarbage = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('2d6-map-maker', 1);
          req.onsuccess = () => {
            const g = req.result.transaction('saves').objectStore('saves').get('current');
            g.onsuccess = () => resolve(g.result?.garbage === true);
          };
        }),
    );
    check(stillGarbage, 'the damaged record is not overwritten while the dialog is open');
    await page.click('[role=alertdialog] button:text-is("Start new game")');
    await page.click('[role=alertdialog] button:text-is("Replace")');
    await page.waitForTimeout(1500);
    check((await page.locator('#load-error-title').count()) === 0, 'dialog is gone after Start new game');
    check((await coverage(page)) === '0%', 'a fresh empty game is shown');
    await reload(page);
    check((await page.locator('#load-error-title').count()) === 0 && (await coverage(page)) === '0%', 'the damaged record is gone after reload');
    await ctx.close();
  }

  check(errors.length === 0, `no page errors ${errors.join('; ')}`);
} catch (e) {
  console.error(e);
  failures.push(String(e));
} finally {
  await browser?.close();
  stopPreview();
}
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nPersistence e2e OK');
