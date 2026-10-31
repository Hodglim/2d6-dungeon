/**
 * Geometry handed to a door-symbol function, in grid units. The context is already
 * translated to the door's centre and rotated so the door runs along the x axis from
 * x = -0.5 to x = 0.5; +y points into the room the door belongs to.
 */
export type DoorSymbol = (ctx: CanvasRenderingContext2D, theme: Theme) => void;

/** Everything visual about a map style. Game systems supply these; the renderer reads them. */
export interface Theme {
  id: string;
  name: string;
  /** Canvas colour outside the map area. */
  backdrop: string;
  paper: string;
  gridDot: string;
  boundary: string;
  /** Floor shades, picked per square for subtle variation. */
  floor: string[];
  decal: string;
  ink: string;
  hatch: string;
  /** Colour at the wall edge of the inner shadow (fades to transparent). */
  shadow: string;
  accent: string;
  accentFaded: string;
  labelFill: string;
  labelText: string;
  labelFont: string;
  token: string;
  tokenText: string;
  footprint: string;
  /** Selection / hover emphasis. */
  highlight: string;
  /** Placement ghost: valid. */
  ghostOk: string;
  /** Placement ghost: invalid. */
  ghostBad: string;
  /** Wall stroke width in grid units. */
  wallWidth: number;
  /** How far hatching reaches from the floor, in squares. */
  hatchReach: number;
  rockStyle: 'hatch' | 'none';
  doorSymbols: Record<string, DoorSymbol>;
}
