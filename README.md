# 2D6 dungeon companion

A tablet-friendly mapping tool for the 2D6 dungeon rules. You roll the dice at the table, type them in, and the app draws the rooms, exits and doors as you go. It works offline once installed.

## Run locally

```
npm install
npm run dev
```

## Publish

The app is a static site hosted on Cloudflare Pages.

1. One time only: `npx wrangler login`.
2. `npm run deploy`. It builds, checks that `dist/` holds only the app (no PDFs, `local-data/`, `reference/` or `.superpowers/`), then uploads it.

The first deploy creates the `2d6-map-maker` Pages project and prints the `*.pages.dev` URL. Later deploys update the same URL.

After the first real deploy, open the URL on the iPad once while online, then switch to airplane mode and check the app still opens.

### Check on the iPad after the first deploy

- Install from Safari, build a room, swipe the app away within 1 second, reopen in airplane mode: the room is there and Undo works.
- Leave the app in the background overnight, then place a room: no "Autosave isn't working" banner stays up.
- Deploy a trivial change: the "New version available — reload" prompt appears and works.

## Install on iPad

Open the URL in Safari, then Share, then Add to Home Screen. The app then opens full-screen and works offline. When a new version is published, a "New version available" bar offers a reload.

## Your data

- The game is saved automatically in the browser on each device. There is one game at a time.
- To move a game to another device, use Menu, then Export game, and Menu, then Import game on the other device. An export holds the current game only, not the undo history.
- Two tabs on one device share one save, and the last change wins.
- If saving ever fails, a red bar appears with an Export button so you can keep a copy.

## Testing

```
npm test                  # unit tests
npm run typecheck
npm run e2e:persistence   # builds, serves with vite preview on port 4175, checks saving, reload, export/import and storage failures in Firefox
npm run e2e:pwa           # builds twice, checks offline use and the update prompt in Firefox (port 4174)
node scripts/visual.mjs http://localhost:5173 visual   # tablet-size screenshots and 44px touch-target check, against a running `npm run dev`
```

`npm run e2e:pwa` and `npm run e2e:persistence` need Playwright's Firefox (`npx playwright install firefox`). Both leave `dist/` as a normal build.
