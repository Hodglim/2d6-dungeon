# Plan 4a: Saving, Undo Persistence and Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The single current game and its undo history survive closing the app. The game can be exported and imported. The app is published to Cloudflare Pages as an installable offline app, with a home-screen hint for iPad Safari tabs.

**Architecture:**
- **Core** gains in-place `History.restore` and whole-history validation.
- **Persistence** (`src/persistence/`) owns the save-record format, a storage adapter (IndexedDB in the app, memory in tests) and a debounced autosaver.
- **The UI** wires start-up restore, the autosave, the failure banner, export/import, replace-game confirmations and the home-screen hint.
- **A service worker and manifest** make the app installable. `npm run deploy` publishes `dist/` with wrangler.

**Tech Stack:** TypeScript 6.0.3, Svelte 5.57, Vite 8.3, Vitest 5.0, Playwright 1.64, IndexedDB, Web Share API, Service Worker, Cloudflare `wrangler`.

**Spec:** `docs/superpowers/specs/2026-11-01-saving-and-hosting-design.md`

## Global Constraints

- **One game only.** There is a single autosave record; there's no list of games.
- **Exported files contain the current game only (no undo history).** Importing starts a fresh history.
- **Only committed steps are saved.** An open play-flow draft is not saved.
- **Single source of truth:** the campaign's map *is* the history's `current`. Never store two copies that can drift.
- **Autosave** runs after every History change, debounced by about 1 second, and flushes on `visibilitychange` (hidden) and `pagehide`.
- **Storage is IndexedDB, not localStorage.** localStorage is allowed only for the hint-dismissed flag, wrapped in try/catch.
- **Validate everything loaded:** the campaign through `parseCampaign`, and **every** history snapshot (current, past, future) for map shape plus `checkInvariants`. Labels must be strings and lengths within `HISTORY_CAP` (200).
- **Never lose the game silently.**
  - A failed save shows a persistent banner and play continues.
  - Bad imports never replace the game.
  - An unloadable save shows a blocking dialog (Export damaged save / Import a file / Start new game) and is never overwritten until the user chooses.
- `src/core` stays free of DOM, Svelte and render imports. Browser storage code lives in `src/persistence/`.
- **Every map change still goes through `History.execute`.** Restore and reset are whole-state replacements.
- **New dependencies** must be pinned to exact versions published at least 14 days before today (2026-11-01). Check with `npm view <pkg> time --json`. Keep them to a minimum: `wrangler` and optionally `fake-indexeddb` as devDependencies.
- **Published `dist/`** must never contain anything from `pdf/`, `local-data/`, `reference/` or `.superpowers/`.
- **Deploying is outward-facing.** No task actually deploys. The first real deploy happens only after the user's explicit go-ahead.
- Touch targets ≥ 44×44 CSS px. Every commit message ends with a blank line, then the Co-Authored-By trailer.

## Review Focus

1. **Closing the iPad app right after an action** (the page is hidden within the debounce window). The pending save must still be written. *(Task 3: the flush test; Task 8: the e2e "act then hide then reload" check.)*
2. **Storage fills up or becomes unavailable mid-session.** Play continues, the banner appears, and a later successful save clears it. *(Task 3: an adapter-failure test; Task 5: the banner.)*
3. **Importing a non-JSON file, a huge file, or a file with a valid campaign but a broken map** must be refused with a message, leaving the game untouched. *(Task 4: the import-parse tests.)*
4. **Two desktop tabs open on the same game** must never corrupt the record. Each save is one atomic record write; last writer wins. *(Task 2: an atomic-put test; noted in the README.)*
5. **After a new deploy, the installed app must not get stuck on an old version.** The service worker offers "New version available — reload". *(Task 7: an update-flow check with two builds in `vite preview`.)*

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/core/history.ts` | + `restore(state)`: replace the timeline in place and emit once |
| `src/core/serialize.ts` | + `mapProblem(raw)` exported (single-map shape check), + `parseHistoryState(raw)` |
| `src/interaction/playflow.ts` | + `dispose()` |
| `src/persistence/record.ts` | `SaveRecord` format, `encodeSave`, `decodeSave` (validation + format version) |
| `src/persistence/store.ts` | `SaveStore` interface, `IdbSaveStore`, `MemorySaveStore` |
| `src/persistence/autosave.ts` | `Autosaver`: debounce, flush, failure state |
| `src/persistence/startup.ts` | `decideStartup(raw)` → fresh / restore / error |
| `src/persistence/files.ts` | `exportFileName`, `exportCampaignFile`, `readImportFile` |
| `src/persistence/standalone.ts` | `isStandalone(env)`, `isIosSafari(env)` |
| `src/ui/SaveBanner.svelte`, `src/ui/InstallHint.svelte`, `src/ui/LoadErrorDialog.svelte`, `src/ui/ReplaceGameDialog.svelte`, `src/ui/UpdatePrompt.svelte` | UI pieces |
| `src/ui/AppShell.svelte`, `src/ui/Menu.svelte` | Wiring: start-up, autosave, menu items |
| `public/manifest.webmanifest`, `public/icons/*`, `src/sw.ts` (or plugin) | Installable offline app |
| `scripts/check-dist.mjs`, `scripts/e2e-persistence.mjs` | Deploy safety check; persistence/PWA e2e |
| `package.json`, `README.md` | `deploy` script, wrangler, how to deploy and install |

---

### Task 1: Core — in-place restore, whole-history validation, PlayFlow.dispose

**Files:** Modify `src/core/history.ts`, `src/core/serialize.ts`, `src/interaction/playflow.ts`. Test: `tests/core/history.test.ts`, `tests/core/serialize.test.ts`, `tests/interaction/playflow.test.ts`.

**Interfaces — Produces:**
```ts
// history.ts
restore(state: HistoryState): void;           // replaces current/past/future (trimmed to cap), emits ONCE
// serialize.ts
export function mapProblem(raw: unknown): string | null;   // the existing per-map shape check, extracted; null = OK
export type HistoryParse = { ok: true; state: HistoryState } | { ok: false; error: string };
export function parseHistoryState(raw: unknown): HistoryParse; // shape + checkInvariants on EVERY snapshot; labels strings; lengths ≤ HISTORY_CAP
// playflow.ts
dispose(): void;                               // unsubscribes from History; later History changes don't touch the flow
```
`parseCampaign` must keep its current behaviour and messages, now built on `mapProblem`.

- [ ] **Step 1: Write the failing tests:**
  - **restore:**
    - Execute 3 commands on History A and export its state. Restore it into a fresh History B that has 1 subscriber: the listener is called exactly once, `B.map` equals A's current, `B.undoLabel` equals A's undo label, and two undos and a redo behave as they did in A.
    - Restoring a state whose `past.length` is 250 keeps the newest 200.
  - **parseHistoryState:**
    - A valid exported state gives `ok`.
    - A broken map deep in `past` (e.g. two overlapping rooms in `past[0].map`) gives `ok:false`, with an error mentioning the history.
    - A non-string label gives `ok:false`.
    - `past.length` of 201 gives `ok:false`.
    - A non-object gives `ok:false`.
  - **mapProblem:** a valid map gives `null`; a map missing `rooms` gives a string.
  - **dispose:** after `flow.dispose()`, `history.undo()` while the flow is mid-draft leaves `flow.step` unchanged (no listener).
- [ ] **Step 2: Run** `npx vitest run tests/core tests/interaction` → the new tests FAIL.
- [ ] **Step 3: Implement.** Extract `mapProblem` from the existing validator, then add `parseHistoryState`, `restore` and `dispose`.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(core): in-place history restore, whole-history validation, PlayFlow.dispose`.

### Task 2: Save record and storage adapters

**Files:** Create `src/persistence/record.ts`, `src/persistence/store.ts`. Test: `tests/persistence/record.test.ts`, `tests/persistence/store.test.ts`. A devDependency `fake-indexeddb` (pinned, ≥14 days old) is allowed only for the IndexedDB adapter test.

**Interfaces — Produces:**
```ts
// record.ts
export const SAVE_FORMAT = 1;
export interface CampaignMeta { id: string; name: string; systemId: string; hero: unknown | null }
export interface SaveRecord { format: number; savedAt: string; meta: CampaignMeta; history: HistoryState }
export function encodeSave(meta: CampaignMeta, history: HistoryState, now?: Date): SaveRecord;
export type SaveDecode = { ok: true; meta: CampaignMeta; history: HistoryState } | { ok: false; error: string };
export function decodeSave(raw: unknown): SaveDecode;    // checks format ≤ SAVE_FORMAT (newer → error), meta shape, parseHistoryState
export function campaignFrom(meta: CampaignMeta, map: DungeonMap): Campaign;  // schemaVersion CURRENT, maps:[map], activeMapId: map.id
export function metaFrom(c: Campaign): CampaignMeta;
// store.ts
export interface SaveStore { load(): Promise<unknown | null>; save(rec: SaveRecord): Promise<void>; requestPersist(): Promise<boolean> }
export class IdbSaveStore implements SaveStore { constructor(dbName?: string) }   // db "2d6-map-maker", store "saves", key "current"; one put per save
export class MemorySaveStore implements SaveStore { failNext: Error | null; saved: SaveRecord | null }
```
`requestPersist` calls `navigator.storage?.persist?.()` and resolves `false` when it's unavailable. It never throws.

- [ ] **Step 1: Write the failing tests:**
  - **Round trip:** `encodeSave` → `JSON.parse(JSON.stringify(...))` → `decodeSave` gives `ok`, and the history undo labels and maps equal the originals.
  - `decodeSave` of `{format: 2, ...}` gives `ok:false` with "newer version". A broken snapshot gives `ok:false`. `null` gives `ok:false`.
  - `campaignFrom(meta, map)` passes `parseCampaign(serializeCampaign(...))`.
  - **IdbSaveStore** (with fake-indexeddb): `load()` on an empty DB is `null`. After `save(a)` then `save(b)`, `load()` returns b. **Review Focus 4:** two saves in flight resolve with the last-written record intact and complete (never a merge).
  - **Size measurement:** a 200-step history from a scripted session of about 40 rooms. Log `JSON.stringify(record).length` in the test output, and assert < 20 MB.
- [ ] **Step 2–4:** FAIL → implement → PASS (`npm test && npm run typecheck`).
- [ ] **Step 5: Commit** `feat(persistence): save record format and IndexedDB store`.

### Task 3: Autosaver

**Files:** Create `src/persistence/autosave.ts`. Test: `tests/persistence/autosave.test.ts`.

**Interfaces:**
- **Consumes:** `SaveStore`, `encodeSave`, `History`.
- **Produces:**
```ts
export interface AutosaveStatus { failing: boolean; lastError: string | null; lastSavedAt: string | null }
export class Autosaver {
  constructor(history: History, store: SaveStore, meta: () => CampaignMeta, opts?: { delayMs?: number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout });
  start(): void;            // subscribes to History; every change schedules a save after delayMs (default 1000)
  flush(): Promise<void>;   // writes immediately if a save is pending
  pause(): void; resume(): void;   // used while the load-error dialog is open
  dispose(): void;
  subscribe(fn: (s: AutosaveStatus) => void): () => void;
}
```
- The first successful save calls `store.requestPersist()` once.
- A failed save sets `failing: true` with the message. The next successful save sets it false again.
- Saves never overlap: if a save is in flight, the next one runs after it, using the latest state.

- [ ] **Step 1: Write the failing tests** (fake timers, `MemorySaveStore`):
  - **Debounce:** 3 executes within 500 ms give exactly 1 save after 1000 ms, holding the latest map.
  - **Review Focus 1:** execute, then `flush()` before the timer fires, gives a save immediately. A second `flush()` with nothing pending writes nothing.
  - **Review Focus 2:** `store.failNext = new Error('QuotaExceededError')`. After the save, the status is `failing:true` and the error is set. After a later change and a successful save, `failing:false`.
  - **Pause:** changes while paused write nothing. After `resume()`, the next change saves.
  - `requestPersist` is called once across several saves.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(persistence): debounced autosaver with flush and failure status`.

### Task 4: Export and import files

**Files:** Create `src/persistence/files.ts`. Test: `tests/persistence/files.test.ts`.

**Interfaces — Produces:**
```ts
export function exportFileName(title: string, date: Date): string;   // "2d6-<slug(title)|dungeon>-<YYYY-MM-DD>.2d6map.json"
export function exportCampaignFile(c: Campaign): { name: string; text: string };   // serializeCampaign, no history
export const MAX_IMPORT_BYTES = 20_000_000;
export function readImportText(text: string, byteLength: number): ParseResult;   // size guard, then parseCampaign
```
**Slug rule:** lowercase, with non-alphanumerics collapsed to `-` and trimmed. An empty slug becomes `dungeon`.

- [ ] **Step 1: Write the failing tests:**
  - `exportFileName('The Front Hall!', new Date('2026-11-01T10:00:00Z'))` gives `'2d6-the-front-hall-2026-11-01.2d6map.json'`, and `exportFileName('', d)` gives `'2d6-dungeon-2026-11-01.2d6map.json'`.
  - `exportCampaignFile` text parses back with `parseCampaign`, and contains no `"past"` key.
  - **Review Focus 3:**
    - `readImportText('not json', 8)` gives `ok:false`.
    - `readImportText(validText, 30_000_000)` gives `ok:false` with a "too large" message.
    - A valid campaign whose map has overlapping rooms gives `ok:false` with "damaged".
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(persistence): export file naming and safe import parsing`.

### Task 5: Wire saving into the app

**Files:**
- Create: `src/ui/SaveBanner.svelte`, `src/ui/LoadErrorDialog.svelte`, `src/ui/ReplaceGameDialog.svelte`.
- Modify: `src/ui/AppShell.svelte`, `src/ui/Menu.svelte`, `src/ui/NewMapDialog.svelte` (only if its confirm step moves to `ReplaceGameDialog`).
- Test: `tests/ui/startup.test.ts` (a pure start-up decision helper), plus visual checks.

**Interfaces:**
- **Consumes:** Tasks 1–4.
- **Produces:** `export function decideStartup(raw: unknown | null): { kind: 'fresh' } | { kind: 'restore'; meta: CampaignMeta; history: HistoryState } | { kind: 'error'; error: string }` in `src/persistence/startup.ts`.

**Behaviour** (spec §6–§9):
- **On mount:**
  - `store.load()` → `decideStartup`.
  - `restore` → `history.restore(state)` and set the meta.
  - `fresh` → keep the new empty map with new meta (`createCampaign`).
  - `error` → `LoadErrorDialog` blocks the app. The autosaver is paused and the record is untouched.
    - **Export damaged save** downloads or shares the raw record as JSON; the dialog stays open.
    - **Import a file** runs the import flow; on success the dialog closes and saving resumes.
    - **Start new game** closes the dialog and saving resumes.
- **Autosaver:** created after start-up; flushes on `visibilitychange` (hidden) and `pagehide`.
- **SaveBanner:** shown while `status.failing`. It reads "Autosave isn't working — export your game to keep a copy" and has an Export button.
- **Menu:** gains **Export game** and **Import game…**.
  - **Export:** if `navigator.canShare?.({ files: [file] })`, use `navigator.share({ files: [file] })`. Otherwise use a Blob download. In both cases use `exportCampaignFile(campaignFrom(meta, history.map))`.
  - **Import:** a file input (`accept=".json,application/json"`) → `readImportText`.
    - Error → the message is shown in a dialog, and nothing changes.
    - OK → `ReplaceGameDialog` → `history.reset(map)` (fresh history), new meta from the file, flush the save.
- **New game and Load demo map** both go through `ReplaceGameDialog`. It reads "This replaces your current game." and has **Export first**, **Replace** and **Cancel**. Export first runs Export and keeps the dialog open.
- The history store and the play flow follow `restore` and `reset` through the existing subscriptions. `PlayFlow` is not recreated, because History is restored in place.

- [ ] **Step 1: Write the failing test** `tests/ui/startup.test.ts`: `decideStartup(null)` gives `fresh`; a valid encoded record gives `restore`; `{format: 99}` gives `error`; a broken snapshot gives `error`.
- [ ] **Step 2–4:** FAIL → implement the helper → PASS. Then build the components and wiring.
- [ ] **Step 5: Visual check.** Extend `scripts/visual.mjs`, or add `scripts/e2e-persistence.mjs` (Task 8 completes it). Place an entrance, reload the page, and confirm the entrance is there and Undo reads "Undo Add entrance". Screenshot `20-after-reload.png`.
- [ ] **Step 6: Run** `npm test && npm run typecheck && npx vite build` → PASS.
- [ ] **Step 7: Commit** `feat(ui): autosave, resume on open, export/import, replace-game confirmations`.

### Task 6: Home-screen hint

**Files:** Create `src/persistence/standalone.ts`, `src/ui/InstallHint.svelte`. Modify `src/ui/AppShell.svelte`. Test: `tests/persistence/standalone.test.ts`.

**Interfaces — Produces:**
```ts
export interface DisplayEnv { matchStandalone: boolean; navigatorStandalone?: boolean; userAgent: string; maxTouchPoints: number; platform: string }
export function isStandalone(env: DisplayEnv): boolean;    // matchStandalone || navigatorStandalone === true
export function isIosSafari(env: DisplayEnv): boolean;     // iPhone/iPad incl. iPadOS desktop-UA (MacIntel + maxTouchPoints > 1)
export function readDisplayEnv(): DisplayEnv;               // browser-only wrapper
```
**Behaviour** (spec §11a):
- When not standalone, show a slim, dismissible banner that doesn't cover the map area. Put it under the toolbar, or as part of the panel.
- **iOS wording:** "Progress in a Safari tab may not be kept — Safari can clear it after 7 days. Add this app to your Home Screen (Share → Add to Home Screen); the installed app keeps its own saved game."
- **Other browsers:** generic install wording.
- **If the map has any rooms,** add the line "Move this game into the installed app: Export it here, then Import it there", with an Export button.
- The dismissal is remembered in localStorage under `2d6.installHintDismissed`, wrapped in try/catch.

- [ ] **Step 1: Write the failing tests:**
  - `isStandalone`: true for `matchStandalone`; true for `navigatorStandalone: true`; false otherwise.
  - `isIosSafari`: true for an iPad UA; true for `platform 'MacIntel'` with `maxTouchPoints 5`; false for desktop Chrome on Linux.
- [ ] **Step 2–4:** FAIL → implement → PASS. Then build the banner.
- [ ] **Step 5: Visual check.** The banner shows in a normal Playwright context. Emulate standalone with `page.emulateMedia({ media: ... })`, or with an injected `matchMedia` override via `addInitScript`, and confirm it doesn't show there. Dismiss, reload, and confirm it stays hidden.
- [ ] **Step 6: Commit** `feat(ui): home-screen hint in browser tabs`.

### Task 7: Installable offline app

**Files:** Create `public/manifest.webmanifest`, `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180×180), and the service worker: either `src/sw.ts` plus a Vite build entry, or a pinned PWA plugin (builder's choice). Create `src/ui/UpdatePrompt.svelte`. Modify `index.html`, `vite.config.ts`, `src/main.ts`.

**Requirements** (spec §11):
- **Manifest:** name "2D6 Map Maker", short_name "2D6 Map", `display: "standalone"`, `orientation: "any"`, `start_url: "./"`, `scope: "./"`, theme and background colours matching the app shell.
- **Icons:** original and simple, e.g. a stylised hatched-wall square with "2D6". Generate the PNGs with a small script (ImageMagick `convert`/`magick` is installed), and commit the script and the PNGs.
- **`index.html`:**
  - the manifest link
  - `apple-touch-icon`
  - `<meta name="apple-mobile-web-app-capable" content="yes">` and `mobile-web-app-capable`
  - `apple-mobile-web-app-status-bar-style`
  - `theme-color`
- **Service worker:**
  - precaches the built assets (hashed files plus `index.html`, the manifest and the icons)
  - cache-first for precached assets, network fallback otherwise
  - versioned cache name per build
  - cleans old caches on `activate`
  - it is registered only in production builds
- **Updates:** when a new service worker is waiting, `UpdatePrompt` shows "New version available — reload". Its button tells the waiting worker to `skipWaiting` and reloads once `controllerchange` fires. No forced reloads mid-play.

- [ ] **Step 1: Write the failing test** `tests/pwa/manifest.test.ts`: parse `public/manifest.webmanifest` and assert `display === 'standalone'`, the name and short_name values above, and that every icon `src` exists on disk with a size matching its declared `sizes` (read the PNG IHDR width and height).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Offline and update check (Review Focus 5)** with `npx vite build && npx vite preview --port 4174 --strictPort` and Playwright (Firefox supports service workers):
  - Load the app, wait for the service worker to be ready, go offline (`context.setOffline(true)`), reload, and confirm the app renders.
  - Go back online. Rebuild with a changed constant, for example a build id injected via `define`. Reload once and confirm the update prompt appears. Click it and confirm the new build id is active.
  - Stop only the preview process you started.
- [ ] **Step 6: Commit** `feat(pwa): manifest, icons, offline service worker, update prompt`.

### Task 8: Deploy script, safety check, e2e and docs

**Files:** Create `scripts/check-dist.mjs`, complete `scripts/e2e-persistence.mjs`, create or modify `README.md`, modify `package.json` (adding `wrangler` as a pinned devDependency, ≥14 days old).

**Requirements:**
- **`package.json` scripts:**
  - `"deploy": "npm run build && node scripts/check-dist.mjs && wrangler pages deploy dist --project-name 2d6-map-maker"`
  - `"build": "vite build"` (already present)
- **`check-dist.mjs`** fails (exit 1, with a message) if `dist/` contains any path under `pdf/`, `local-data/`, `reference/` or `.superpowers/`, or any `.pdf` file, or if `dist/index.html` is missing. It prints the file count and total size.
- **README sections:**
  - **Run locally:** `npm run dev`.
  - **Publish:** one-time `npx wrangler login`, then `npm run deploy`. The first deploy creates the `2d6-map-maker` Pages project and prints the `*.pages.dev` URL.
  - **Install on iPad:** open the URL in Safari → Share → Add to Home Screen.
  - **Your data:** the saved game lives on each device; use Export/Import to move it. Two tabs on one device share one save, and the last change wins.
- **`e2e-persistence.mjs`**, using Playwright against `vite preview` (port 4175, `--strictPort`):
  - place an entrance and a room, then reload: both are still there, and Undo works
  - act, then immediately dispatch `visibilitychange` (hidden) and `pagehide`, then reload: the last action is kept (Review Focus 1)
  - export, then import the file in a fresh browser context: the game matches, and Undo is disabled
  - import a corrupt file: a message appears and the game is unchanged
  - make IndexedDB writes fail (stub `IDBObjectStore.prototype.put` via `addInitScript` to throw): the save banner appears and play continues (Review Focus 2)
  - corrupt the saved record (write garbage via the page): on reload the blocking dialog shows, and "Start new game" clears it
- **Do NOT run `npm run deploy` or `wrangler`** in this task. Verify the deploy script only with `node scripts/check-dist.mjs` after `npm run build`.

- [ ] **Step 1:** Write `check-dist.mjs`. Test it by building, then temporarily placing a dummy `dist/reference/x.txt`: confirm it exits 1. Remove the dummy and confirm it exits 0.
- [ ] **Step 2:** Complete `e2e-persistence.mjs` and run it until it passes cleanly.
- [ ] **Step 3:** Add `wrangler`, the `deploy` script and the README.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npx vite build && node scripts/check-dist.mjs && node scripts/e2e-persistence.mjs` → all pass. Also run the existing `scripts/visual.mjs` once to confirm there are no regressions.
- [ ] **Step 5: Commit** `feat: deploy script with dist safety check, persistence e2e, README`.
