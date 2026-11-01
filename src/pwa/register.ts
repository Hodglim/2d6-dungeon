// Service-worker registration and update tracking (production builds only; see main.ts).
// `waiting` is a new worker that is installed but not yet in control: the page shows a reload prompt,
// and only the user's click (SKIP_WAITING) activates it. A first install never counts as an update.

declare const __BUILD_ID__: string;

type Listener = (waiting: ServiceWorker | null) => void;
const CHECK_EVERY_MS = 30 * 60 * 1000;

let waiting: ServiceWorker | null = null;
const listeners = new Set<Listener>();

export function onUpdateWaiting(fn: Listener): () => void {
  listeners.add(fn);
  fn(waiting);
  return () => listeners.delete(fn);
}

function setWaiting(w: ServiceWorker | null) {
  waiting = w;
  for (const fn of listeners) fn(w);
}

export function buildId(): string {
  return __BUILD_ID__;
}

/** Tells the waiting worker to take over; the page reloads on controllerchange (see reloadOnControllerChange). */
export function applyUpdate(): void {
  reloadRequested = true;
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}

let reloadRequested = false;
let beforeReload: () => Promise<void> = async () => {};
/** The app registers its autosave flush here; it runs before the update reload (bounded to 2s). */
export function setBeforeReload(fn: () => Promise<void>): void {
  beforeReload = fn;
}

/** Reloads exactly once when a new worker takes control, but only after the user asked (the prompt click).
 *  A first-install claim, or another tab's update, never reloads this page by itself. */
function reloadOnControllerChange(): void {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadRequested || reloading) return;
    reloading = true;
    void Promise.race([beforeReload().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]).then(() =>
      location.reload(),
    );
  });
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  reloadOnControllerChange();
  void (async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        const check = () => {
          // 'installed' with an existing controller means this is an update, not the first install.
          if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w);
        };
        w.addEventListener('statechange', check);
        check();
      };
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));

      // An app left open for days (iPad) re-checks when it comes back to the foreground.
      let last = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - last < CHECK_EVERY_MS) return;
        last = Date.now();
        void reg.update().catch(() => {});
      });
    } catch {
      // Offline-capable install failed (private mode, etc.); the app still works online.
    }
  })();
}
