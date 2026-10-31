import { perimeterEdges, sameEdge } from '../core/geometry';
import { roomAt } from '../core/query';
import type { Cell, DungeonMap } from '../core/types';
import { type Camera, fitCamera, worldBounds } from './camera';
import { doorGlyphs, exitStubs } from './doors';
import {
  drawDecals,
  drawDoors,
  drawExitStubs,
  drawFeatures,
  drawFloors,
  drawFootprints,
  drawHatching,
  drawLabels,
  drawPaper,
  drawShadows,
  drawToken,
  drawWalls,
  LABEL_FONT_SIZE,
  LABEL_PAD_X,
  LABEL_PAD_Y,
  measureText,
} from './draw';
import { floorDecals, floorTiles } from './floor';
import { hatchStrokes } from './hatching';
import { type MeasureText, placeLabels } from './labels';
import type { Theme } from './theme';
import { footprints, pathPosition } from './token';
import { wallSegments, wallShadows } from './walls';

export interface DisplayToggles {
  grid: boolean;
  shadows: boolean;
  hatching: boolean;
  decals: boolean;
  footprints: boolean;
  token: boolean;
}

export const DEFAULT_TOGGLES: DisplayToggles = {
  grid: true,
  shadows: true,
  hatching: true,
  decals: true,
  footprints: true,
  token: true,
};

/** Squares per second when the token walks. */
export const WALK_SPEED = 4;

/** A label measurer backed by a canvas context. */
export function canvasMeasure(ctx: CanvasRenderingContext2D, theme: Theme): MeasureText {
  return (text) => ({
    w: measureText(ctx, text, LABEL_FONT_SIZE, theme.labelFont) + LABEL_PAD_X * 2,
    h: LABEL_FONT_SIZE + LABEL_PAD_Y * 2,
  });
}

/**
 * Draw everything that doesn't animate (paper → labels) in world units. Used for the
 * on-screen cache and, later, PNG export. The context must already map 1 unit = 1 square.
 */
export function renderStatic(ctx: CanvasRenderingContext2D, map: DungeonMap, theme: Theme, toggles: DisplayToggles): void {
  drawPaper(ctx, map, theme, toggles.grid);
  if (toggles.hatching && theme.rockStyle === 'hatch') drawHatching(ctx, hatchStrokes(map, theme.hatchReach), theme);
  drawFloors(ctx, floorTiles(map, theme.floor.length), theme);
  if (toggles.decals) drawDecals(ctx, floorDecals(map), theme);
  if (toggles.shadows) drawShadows(ctx, wallShadows(map), theme);
  drawWalls(ctx, wallSegments(map), theme);
  drawDoors(ctx, doorGlyphs(map), theme);
  drawExitStubs(ctx, exitStubs(map), theme, fadedExits(map));
  drawFeatures(ctx, map.features, theme);
  drawLabels(ctx, placeLabels(map, canvasMeasure(ctx, theme)), theme);
}

/** Open exits not on the walls of the room the token stands in are drawn faded. */
export function fadedExits(map: DungeonMap): Set<string> {
  const here = map.token ? roomAt(map, map.token) : undefined;
  const edges = here ? perimeterEdges(here) : [];
  return new Set(map.doors.filter((d) => !edges.some((p) => sameEdge(p.edge, d))).map((d) => d.id));
}

interface Walk {
  path: Cell[];
  start: number;
  onDone: () => void;
}

/**
 * Draws a map onto a canvas. Static layers are rendered once into an offscreen cache at a
 * resolution matched to the zoom level (rebuilt when the map, theme, toggles or zoom
 * bucket change); each frame just blits the cache and draws footprints and the token.
 */
export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private map: DungeonMap | null = null;
  private toggles: DisplayToggles = { ...DEFAULT_TOGGLES };
  private cam: Camera = { x: 0, y: 0, scale: 24 };
  private dpr = 1;
  private cache: HTMLCanvasElement | null = null;
  private cacheScale = 0;
  private cacheDirty = true;
  private walk: Walk | null = null;
  private frame = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private theme: Theme,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  get camera(): Camera {
    return this.cam;
  }

  setMap(map: DungeonMap): void {
    if (map === this.map) return;
    this.map = map;
    this.cacheDirty = true;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.cacheDirty = true;
  }

  setToggles(toggles: DisplayToggles): void {
    this.toggles = { ...toggles };
    this.cacheDirty = true;
  }

  setCamera(cam: Camera): void {
    this.cam = cam;
  }

  /** Size the canvas backing store to its CSS size × devicePixelRatio. */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  fit(): void {
    if (!this.map) return;
    this.cam = fitCamera(worldBounds(this.map), this.canvas.width / this.dpr, this.canvas.height / this.dpr);
  }

  /** Animate the token along `path` (starting at the token), then call onDone to commit the move. */
  walkToken(path: Cell[], onDone: () => void): void {
    this.walk = { path, start: performance.now(), onDone };
  }

  get walking(): boolean {
    return this.walk !== null;
  }

  start(): void {
    const loop = (t: number) => {
      this.draw(t);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
  }

  private draw(time: number): void {
    const { ctx, map } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e9e9e6';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!map) return;
    this.ensureCache();
    const s = this.cam.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, -this.cam.x * s, -this.cam.y * s);
    const b = worldBounds(map);
    if (this.cache) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.cache, b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    }
    this.drawDynamic(map, time);
  }

  private drawDynamic(map: DungeonMap, time: number): void {
    const token = map.token;
    if (!token) return;
    let pos = { x: token.x + 0.5, y: token.y + 0.5 };
    let trail = token.trail;
    let at: Cell = token;
    if (this.walk) {
      const travelled = ((time - this.walk.start) / 1000) * WALK_SPEED;
      const p = pathPosition(this.walk.path, travelled);
      pos = p;
      const passed = Math.min(this.walk.path.length - 1, Math.floor(travelled));
      trail = [...token.trail, ...this.walk.path.slice(0, passed)];
      at = this.walk.path[passed]!;
      if (p.done) {
        const done = this.walk.onDone;
        this.walk = null;
        done();
      }
    }
    if (this.toggles.footprints) drawFootprints(this.ctx, footprints(map, trail, at), this.theme);
    if (this.toggles.token) drawToken(this.ctx, pos.x, pos.y, this.theme, time);
  }

  /** Zoom levels are bucketed (×√2 steps) so panning never re-renders and zooming rarely does. */
  private ensureCache(): void {
    const map = this.map;
    if (!map) return;
    const wanted = Math.min(96, Math.pow(Math.SQRT2, Math.ceil(Math.log(this.cam.scale * this.dpr) / Math.log(Math.SQRT2))));
    if (!this.cacheDirty && this.cache && wanted === this.cacheScale) return;
    const b = worldBounds(map);
    const maxPx = 8192;
    const scale = Math.min(wanted, maxPx / (b.w + 2), maxPx / (b.h + 2));
    const cache = this.cache ?? document.createElement('canvas');
    cache.width = Math.ceil((b.w + 2) * scale);
    cache.height = Math.ceil((b.h + 2) * scale);
    const cctx = cache.getContext('2d');
    if (!cctx) return;
    cctx.setTransform(scale, 0, 0, scale, -(b.x - 1) * scale, -(b.y - 1) * scale);
    renderStatic(cctx, map, this.theme, this.toggles);
    this.cache = cache;
    this.cacheScale = wanted;
    this.cacheDirty = false;
  }
}
