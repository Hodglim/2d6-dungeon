export type Side = 'N' | 'W';
export type Direction = 'N' | 'S' | 'E' | 'W';

export interface Cell {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An edge between two grid squares, stored canonically as the N or W side of square (x,y). */
export interface Edge {
  x: number;
  y: number;
  side: Side;
}

export type RoomKind = 'room' | 'corridor' | 'passage' | 'entrance';
export type SizeClass = 'normal' | 'small' | 'large';

export interface RoomLabel {
  type: string;
  unique: boolean;
  narrative: string;
}

export interface Room extends Rect {
  id: string;
  /** Display number for kind 'room'; 0 for corridors, passages and the entrance. */
  number: number;
  kind: RoomKind;
  /** Set for kind 'room'; null for every other kind. */
  sizeClass: SizeClass | null;
  label: RoomLabel;
  /** The door this room was entered through (its label anchors there); null for the entrance. */
  entryDoorId: string | null;
}

export interface DoorLock {
  locked: boolean;
  note: string;
  quality: number | null;
}

export interface Door extends Edge {
  id: string;
  type: string;
  secret: boolean;
  lock: DoorLock | null;
}

export type Feature =
  | { id: string; kind: 'stairs'; x: number; y: number; dir: 'up' | 'down'; linkedMapId?: string }
  | { id: string; kind: 'note'; x: number; y: number; text: string };

export interface Token {
  x: number;
  y: number;
  trail: Cell[];
}

export interface DungeonMap {
  id: string;
  title: string;
  hero: string;
  level: string;
  width: number;
  height: number;
  themeId: string;
  defaultDoorType: string;
  seed: number;
  rooms: Room[];
  doors: Door[];
  features: Feature[];
  token: Token | null;
}

export interface Campaign {
  schemaVersion: number;
  id: string;
  name: string;
  systemId: string;
  maps: DungeonMap[];
  activeMapId: string;
  /** Reserved for the Part 3 character sheet; shape defined by the game system. */
  hero: unknown | null;
}
