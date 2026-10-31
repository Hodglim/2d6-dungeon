import { randomId, type IdFn } from './ids';
import type { GameSystem } from './system';
import type { Campaign, DungeonMap } from './types';

export const CURRENT_SCHEMA_VERSION = 1;
/** Maps are at most this many squares on each side. */
export const MAX_MAP_SIZE = 100;

export interface NewMapOptions {
  title?: string;
  hero?: string;
  level?: string;
  width?: number;
  height?: number;
  seed?: number;
  newId?: IdFn;
}

/** Map dimensions are whole squares in 1..MAX_MAP_SIZE (the limit parseCampaign enforces). */
function clampSize(n: number): number {
  return Math.min(MAX_MAP_SIZE, Math.max(1, Math.round(n)));
}

export function createMap(system: GameSystem, opts: NewMapOptions = {}): DungeonMap {
  const newId = opts.newId ?? randomId;
  return {
    id: newId(),
    title: opts.title ?? '',
    hero: opts.hero ?? '',
    level: opts.level ?? '',
    width: clampSize(opts.width ?? system.defaultMapSize.width),
    height: clampSize(opts.height ?? system.defaultMapSize.height),
    themeId: system.defaultThemeId,
    defaultDoorType: system.defaultDoorType,
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    rooms: [],
    doors: [],
    features: [],
    token: null,
  };
}

export function createCampaign(
  system: GameSystem,
  name: string,
  mapOpts: NewMapOptions = {},
): Campaign {
  const newId = mapOpts.newId ?? randomId;
  const map = createMap(system, { ...mapOpts, newId });
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    name,
    systemId: system.id,
    maps: [map],
    activeMapId: map.id,
    hero: null,
  };
}
