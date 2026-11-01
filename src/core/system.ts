import type { Direction } from './types';

export interface DoorTypeDef {
  id: string;
  name: string;
}

/**
 * The rules-facing part of a game system. Rendering concerns (themes, symbols)
 * are registered separately by the render layer so core stays canvas-free.
 */
export interface GameSystem {
  id: string;
  name: string;
  doorTypes: DoorTypeDef[];
  defaultDoorType: string;
  defaultThemeId: string;
  /** Map edge the entrance sits outside of. */
  entranceEdge: Direction;
  defaultMapSize: { width: number; height: number };
  /** Inclusive range for each room dimension (one die each). */
  roomDieRange: { min: number; max: number };
  maxExits: number;
  /** Describes what is wrong with a loaded hero, or null if it is valid. Called only for non-null heroes. */
  heroProblem?: (hero: unknown) => string | null;
}
