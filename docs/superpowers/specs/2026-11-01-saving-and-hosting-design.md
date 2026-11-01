# 2D6 Map Maker: Saving, Undo Persistence and Hosting (Plan 4a) Design

**Date:** 2026-11-01
**Status:** Agreed in conversation. Builder check done (§14). Pending user review.
**Builds on:**
- the code on `master`: Plans 1–3 plus the ghost-positioning change (330 tests)
- `docs/superpowers/specs/2026-10-31-map-editor-core-design.md` §10–11 (the original persistence notes; this document supersedes them where they differ)
- the Plan 4 items in `docs/superpowers/plans/2026-10-31-plan-1-followups.md`

## 1. Intent

The user plays one game at a time on an **iPad** in landscape and comes back to it days
later. Today a reload loses everything. This plan makes the game and its undo history
survive closing the app, lets the user move a game between devices or keep a backup, and
publishes the app so the iPad can install it on the home screen. Home-screen installation
matters because Safari deletes a plain website's stored data after 7 days without use, but
a home-screen web app keeps its storage.

Success: the user opens the app on the iPad days later and finds the game exactly as they
left it, with Undo still working.

## 2. Goals

1. **Autosave** the single current game and its full undo/redo timeline after every change,
   on the device.
2. **Resume on open:** launching the app restores the game and undo history automatically.
3. **New game** replaces the current game after a confirmation that suggests exporting
   first.
4. **Export / Import** the current game as a file (to move between devices or keep a
   backup).
5. **Clear failure handling:** a persistent banner if saving fails; damaged or newer-version
   files are refused with a plain message and never replace the current game.
6. **Hosting:** publish to **Cloudflare Pages** over HTTPS with one command.
7. **Installable offline app:** the app can be added to the iPad home screen, opens full
   screen, and works offline.

## 3. Non-goals

- More than one saved game, and any list of games. The user plays one game at a time.
- **Undo history in exported files.** Not required (user decision). Export holds the current
  game only; import starts a fresh history.
- Saving a half-placed room. Only committed steps are saved; an open play-flow draft is lost
  on reload.
- PNG export (still Plan 4, later).
- The game engine: tables, monsters, character sheet. Next, after this plan.
- Accounts, cloud sync, or anything running on a server. The app is static files only.

## 4. Anti-goals

These would make it a failure even if it technically worked:
- Losing the user's game silently: a save that fails without telling them, or an import or
  restore that wipes the current game on bad input.
- A restored game that looks different from before. Decoration is seeded per map, and must
  stay identical.
- Any rulebook content (`pdf/`, `local-data/`) ending up in the published site.
- Publishing to a public URL without the user's go-ahead. The first deploy needs their
  explicit confirmation.

## 5. Constraints

- Current stack: TypeScript 6, Svelte 5.57, Vite 8.3, Vitest 5, Playwright 1.64.
- Keep the layering: `src/core` stays free of DOM, Svelte and render imports. Browser
  storage code lives outside core (e.g. `src/persistence/`).
- **Every map change still goes through `History.execute`.** Restoring is a whole-state
  replacement, not a map edit.
- The schema version stays 1 unless this plan changes the saved shape. If it does, bump the
  version and add a migration.
- New dependencies must be pinned to exact versions at least two weeks old. Prefer few.
- The iPad is the primary target, running iPadOS Safari as a home-screen web app.

## 6. What gets saved, and when

- **One autosave record** on the device, holding:
  - the `Campaign` (`schemaVersion`, the map, `hero: null` for now)
  - the `History` state (`exportState()`: `current`, `past`, `future`, with their labels),
    capped at **20 steps** (user decision, 2026-11-01: most undo use is correcting the latest room placement; 5–10 steps is typical). The same cap applies in memory and in the save
  - `savedAt`, a timestamp
- **Single source of truth:** the campaign's map *is* the history's `current`. Don't store
  two copies that can drift. Rebuild the campaign map from the history state on load, or
  store the map only once.
- **When:** after every History change (execute, undo, redo, reset), debounced by about
  1 second. Also flush when the page is hidden or closed (`visibilitychange` /
  `pagehide`), so closing the iPad app straight after an action doesn't lose it.
- **Where:** IndexedDB, not localStorage. Snapshots lose their in-memory sharing in JSON, so
  even 20 can be a few hundred KB on a big map.
- **Ask the browser to keep the data:** call `navigator.storage.persist()` where available,
  once, on the first save.
- **Measure:** report the saved record's size for a 20-step history on a large map in tests.
  No compaction is needed.

## 7. Resume on open

- On launch, load the autosave record. **Validate everything before using it:**
  - the campaign through the existing `parseCampaign` checks
  - **every** history snapshot (`current`, each `past` and `future` map) with the same
    map-shape validation plus `checkInvariants`
  - labels must be strings, and the lengths must be within the cap
- **Valid:** restore the game and the undo history.
- **Invalid or unreadable:** don't crash or hide it. Show a **blocking dialog** ("Your
  saved game couldn't be loaded") before any play, and keep the bad record untouched. There
  is no autosave while the dialog is up. Offer three choices:
  - **Export the damaged save:** a download of the raw record, for recovery. The dialog
    stays open after it.
  - **Import a file:** the normal import flow. On success it replaces the record.
  - **Start a new game:** replaces the record.
- **Restore in place.** The app shell holds one `History` that `PlayFlow`, the history store
  and the map view all subscribe to.
  - Restoring must either replace that history's state *in place* (e.g.
    `History.restore(state)`, which emits once so all subscribers update), or rebuild every
    subscriber cleanly.
  - `PlayFlow` needs a `dispose()` if its History can be swapped (a carried-forward review
    item).
  - The builder chooses which approach; in-place is preferred.
- No save at all means a brand-new empty game. That's today's start-up behaviour.

## 8. New game, Export, Import

- **New game** (menu, existing dialog):
  - The confirmation says the current game will be replaced and offers **Export first**.
  - After confirming, the new map starts with a fresh, empty undo history, and is
    autosaved.
- **Export** (menu):
  - Produces the current game as a JSON file named like
    `2d6-<title or "dungeon">-<YYYY-MM-DD>.2d6map.json`, using the existing
    `serializeCampaign`. It contains no history.
  - **iPad:** use the Web Share API with a file (`navigator.share({ files })`) when
    `navigator.canShare({ files })` is true, so the user can Save to Files or AirDrop.
  - **Otherwise:** a normal download.
- **Import** (menu):
  - Pick a file (accept `.json`, including `.2d6map.json`), then parse it with
    `parseCampaign`.
  - **Invalid:** show its plain message ("This isn't a map file", "Made by a newer version
    of the app", "The map file is damaged: …"). The current game is untouched.
  - **Valid:** confirm ("This replaces your current game"), then replace the game, start a
    fresh undo history, and autosave.

## 9. Save failures

- If writing the autosave fails (quota exceeded, storage blocked or unavailable), show a
  **persistent banner**: "Autosave isn't working — export your game to keep a copy". It has
  an Export button and stays until a later save succeeds.
- The app keeps working in memory. Retry on the next change.
- Never let a storage error break play.

## 10. Hosting on Cloudflare Pages

- `npm run deploy` builds the app and uploads `dist/` to Cloudflare Pages by direct upload,
  using Cloudflare's `wrangler` CLI. No Git connection or public repository is needed.
- **One-time setup by the user:**
  - sign in once (`npx wrangler login`, run by the user)
  - the project name and the resulting `*.pages.dev` URL are recorded in the README or
    package scripts
- **The first deploy needs the user's explicit go-ahead,** because it publishes a public
  URL. Later deploys follow the same command.
- **Only the built app is uploaded.** Verify `dist/` contains nothing from `pdf/`,
  `local-data/`, `reference/` or `.superpowers/`. A small check in the deploy script is
  welcome.

## 11. Installable offline app (PWA)

- **A web app manifest:**
  - name "2D6 Map Maker", short name "2D6 Map"
  - `display: standalone`, landscape-friendly
  - theme and background colours matching the app
  - original icons (a simple glyph, nothing taken from the rulebook or the itch.io tool) at
    the sizes iPadOS and browsers need, including `apple-touch-icon`
- **iOS meta tags** for home-screen web apps.
- **A service worker** that caches the built app shell, so the app opens and works offline
  once it has been installed or visited.
  - **Updates:** a new deploy is picked up on the next launch, or on a refresh with a "New
    version available — reload" prompt.
  - It must never cache in a way that leaves the user stuck on an old version with no way
    forward.
- The builder chooses between a small hand-written service worker and a pinned Vite PWA
  plugin. Keep it simple and testable.

## 11a. Home-screen hint (user decision)

- Detect when the app is running in a browser tab rather than installed, using
  `matchMedia('(display-mode: standalone)')` and, on iOS, `navigator.standalone`.
- **In a tab,** show a slim, dismissible banner:
  - It explains that progress in a browser tab may not be kept (Safari can delete it after
    7 days) and that the installed app stores its game separately.
  - It shows how to install: Share → Add to Home Screen on iPad. Use generic install wording
    on other browsers.
  - If a game is already in progress in the tab, it suggests **exporting it and importing it
    in the installed app**, with an Export button.
- **Never show it inside the installed app.** Remember a dismissal for that browser, using
  localStorage, with a try/catch around it.

## 12. Testing

- **Unit (Vitest):**
  - the save and load round-trip, with history and labels intact (using an in-memory
    IndexedDB stand-in such as `fake-indexeddb`, or an injected storage adapter)
  - validation that rejects a damaged snapshot anywhere in the history
  - the size measurement for a 200-step history
  - the export file name
  - import refusal cases
  - `History.restore` (or its equivalent) emitting once and leaving undo/redo working
  - debounce and flush behaviour, with an injected timer
- **Visual / e2e (Playwright):**
  - build a room, reload, and check the room is there and Undo still works
  - export, then import the file in a fresh context, and check the game matches and Undo is
    empty
  - import a corrupt file and check the message appears and the game is unchanged
  - simulate a storage failure and check the banner
  - check the manifest and the service worker are served by `vite preview`, and that the
    app reloads offline after one visit
  - the home-screen banner shows in a normal browser context, can be dismissed, and doesn't
    show when standalone display mode is emulated
  - a corrupt autosave record shows the blocking dialog, and each of its three choices
    behaves as described

## 13. Builder's calls (not discussed with the user)

- The storage layout. No compaction is needed at a 20-step cap.
- `History.restore` in place versus rebuilding subscribers.
- Hand-written service worker versus a pinned PWA plugin, and the update prompt's exact
  form.
- The icon design: simple, original, and readable at small sizes.
- The debounce value (about 1 second) and the flush triggers.
- The exact wording of messages, keeping it plain.
- The Cloudflare Pages project name. Suggest `2d6-map-maker` and confirm with the user at
  the first deploy.

## 14. Builder-check questions and answers

**User decision:** show the home-screen hint when the app is opened in a browser tab (§11a).

**Settled as builder's calls** (flagged for the user to check):
- **An unloadable save** gets a blocking dialog with Export damaged save, Import a file and
  Start new game. There is no autosave while it's open (§7).
- **The autosave record carries its own format version,** and every snapshot is migrated
  when the schema changes.
- **The history tracks only the active map.** If an imported file holds more than one map,
  that's still the active one.
- **`wrangler` is a pinned devDependency.** The first deploy stops for the user's go-ahead.
- **"Load demo map"** gets the same "replaces your game, export first?" confirmation as New
  game.

