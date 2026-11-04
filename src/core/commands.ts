import type { Door, DungeonMap, Feature, Room, Token } from './types';

/** A change to a map. `apply` is pure: it returns a new map, sharing unchanged parts.
 * Undo/redo is handled by History's snapshots. */
export interface Command {
  label: string;
  apply(map: DungeonMap): DungeonMap;
}

/** A change to the hero (an opaque value in core). Like a Command, but it leaves the map alone. */
export interface HeroCommand {
  label: string;
  applyHero(hero: unknown | null): unknown | null;
}

export const setHero = (after: unknown | null, label: string): HeroCommand => ({ label, applyHero: () => after });

/** The hero and the encounter together, as one undo step (fight actions change both). */
export interface PlayState {
  hero: unknown | null;
  encounter: unknown | null;
}

export interface PlayCommand {
  label: string;
  applyPlay(s: PlayState): PlayState;
}

export const setPlay = (after: PlayState, label: string): PlayCommand => ({ label, applyPlay: () => after });

type Collection = 'rooms' | 'doors' | 'features';
type ItemOf<K extends Collection> = DungeonMap[K][number];

function addItem<K extends Collection>(key: K, item: ItemOf<K>, label: string): Command {
  return { label, apply: (m) => ({ ...m, [key]: [...m[key], item] }) };
}

function removeItem<K extends Collection>(key: K, item: ItemOf<K>, label: string): Command {
  return { label, apply: (m) => ({ ...m, [key]: (m[key] as ItemOf<K>[]).filter((x) => x.id !== item.id) }) };
}

function updateItem<K extends Collection>(key: K, before: ItemOf<K>, after: ItemOf<K>, label: string): Command {
  return {
    label,
    apply: (m) => ({ ...m, [key]: (m[key] as ItemOf<K>[]).map((x) => (x.id === before.id ? after : x)) }),
  };
}

export const addRoom = (room: Room) => addItem('rooms', room, 'Add room');
export const removeRoom = (room: Room) => removeItem('rooms', room, 'Remove room');
export const updateRoom = (before: Room, after: Room) => updateItem('rooms', before, after, 'Edit room');

export const addDoor = (door: Door) => addItem('doors', door, 'Add door');
export const removeDoor = (door: Door) => removeItem('doors', door, 'Remove door');
export const updateDoor = (before: Door, after: Door) => updateItem('doors', before, after, 'Edit door');

export const addFeature = (f: Feature) => addItem('features', f, `Add ${f.kind}`);
export const removeFeature = (f: Feature) => removeItem('features', f, `Remove ${f.kind}`);
export const updateFeature = (before: Feature, after: Feature) => updateItem('features', before, after, `Edit ${after.kind}`);

export function setToken(before: Token | null, after: Token | null): Command {
  return { label: 'Move token', apply: (m) => ({ ...m, token: after }) };
}

export function updateMapInfo(
  before: Pick<DungeonMap, 'title' | 'hero' | 'level' | 'defaultDoorType' | 'themeId'>,
  after: Pick<DungeonMap, 'title' | 'hero' | 'level' | 'defaultDoorType' | 'themeId'>,
): Command {
  return {
    label: 'Edit map info',
    apply: (m) => ({ ...m, ...after }),
  };
}

/** Several commands applied in order, as one undo step. */
export function compound(label: string, commands: Command[]): Command {
  return {
    label,
    apply: (m) => commands.reduce((acc, c) => c.apply(acc), m),
  };
}
