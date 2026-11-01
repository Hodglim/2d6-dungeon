/** Whether the app runs installed (home-screen / standalone) or in a browser tab. */
export interface DisplayEnv {
  matchStandalone: boolean;
  navigatorStandalone?: boolean;
  userAgent: string;
  maxTouchPoints: number;
  platform: string;
}

export function isStandalone(env: DisplayEnv): boolean {
  return env.matchStandalone || env.navigatorStandalone === true;
}

/** iPhone/iPad, including iPadOS that reports a desktop Mac user agent. */
export function isIosSafari(env: DisplayEnv): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return env.platform === 'MacIntel' && env.maxTouchPoints > 1;
}

/** Browser-only: reads the current environment. */
export function readDisplayEnv(): DisplayEnv {
  let matchStandalone = false;
  try {
    matchStandalone = window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    // no matchMedia: treat as a tab
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return { matchStandalone, navigatorStandalone: nav.standalone, userAgent: nav.userAgent, maxTouchPoints: nav.maxTouchPoints ?? 0, platform: nav.platform ?? '' };
}
