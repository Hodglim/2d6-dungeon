import { perimeterEdges, sameEdge } from '../core/geometry';
import { roomAt } from '../core/query';
import type { Cell, DungeonMap } from '../core/types';
import { type Camera, fitCamera, type Point, screenToWorld, worldBounds } from './camera';
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
  drawSplats,
  drawToken,
  drawWalls,
  LABEL_FONT_SIZE,
  LABEL_PAD_X,
  LABEL_PAD_Y,
  measureText,
} from './draw';
import { battleSplats, floorDecals, floorTiles } from './floor';
import { hatchStrokes } from './hatching';
import { type LabelBox, type MeasureText, placeLabels } from './labels';
import type { Theme } from './theme';
import { footprints, pathPosition, walkTrail } from './token';
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

/** Largest cache canvas side (iOS Safari silently renders blank beyond ~4096² / 16.7M px). */
const MAX_CACHE_SIDE = 4096;
const MAX_CACHE_AREA = 16_000_000;
/** Minimum interval between idle frames, for the token pulse. */
const IDLE_FRAME_MS = 66;

/**
 * Effective cache resolution (px per square): the wanted one, clamped so the cache canvas
 * (world plus a one-square margin each side) stays within iOS-safe limits.
 */
export function cacheScaleFor(wantedPxPerSquare: number, worldW: number, worldH: number): number {
  const w = worldW + 2;
  const h = worldH + 2;
  return Math.min(wantedPxPerSquare, MAX_CACHE_SIDE / w, MAX_CACHE_SIDE / h, Math.sqrt(MAX_CACHE_AREA / (w * h)));
}

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
export function renderStatic(
  ctx: CanvasRenderingContext2D,
  map: DungeonMap,
  theme: Theme,
  toggles: DisplayToggles,
  options: { exitStubs?: boolean; labels?: boolean; features?: boolean } = {},
): void {
  const labels = placeLabels(map, canvasMeasure(ctx, theme));
  const layers: (() => void)[] = [
    () => { drawPaper(ctx, map, theme, toggles.grid); },
    () => { if (toggles.hatching && theme.rockStyle === 'hatch') drawHatching(ctx, hatchStrokes(map, theme.hatchReach), theme); },
    () => { drawFloors(ctx, floorTiles(map, theme.floor.length), theme); },
    () => { if (toggles.decals) drawDecals(ctx, floorDecals(map), theme); },
    () => {
      // Signs of battle where fights were won, kept to the floor so no droplet lands in the rock.
      const splats = toggles.decals ? battleSplats(map, labels) : [];
      if (!splats.length) return;
      ctx.beginPath();
      for (const r of map.rooms) ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      drawSplats(ctx, splats, theme);
    },
    () => { if (toggles.shadows) drawShadows(ctx, wallShadows(map), theme); },
    () => { drawWalls(ctx, wallSegments(map), theme); },
    () => { drawDoors(ctx, doorGlyphs(map), theme); },
    () => { if (options.exitStubs ?? true) drawExitStubs(ctx, exitStubs(map), theme, fadedExits(map)); },
    () => { if (options.labels ?? true) drawLabels(ctx, labels, theme); },
    () => { if (options.features ?? true) drawFeatures(ctx, map.features, theme); },
  ];
  for (const layer of layers) {
    ctx.save();
    layer();
    ctx.restore();
  }
}

/**
 * Open exits not on the walls of the room the token stands in are drawn faded. `at` is the
 * token's square (defaults to the map's token; mid-walk, the animated token's square).
 */
export function fadedExits(map: DungeonMap, at: Cell | null = map.token): Set<string> {
  const here = at ? roomAt(map, at) : undefined;
  const edges = here ? perimeterEdges(here) : [];
  return new Set(map.doors.filter((d) => !edges.some((p) => sameEdge(p.edge, d))).map((d) => d.id));
}

/**
 * Whether the static layers (cached offscreen) may look different between two maps.
 * Commands share unchanged arrays, so a token move or a map-info edit compares equal.
 */
export function staticChanged(prev: DungeonMap | null, next: DungeonMap): boolean {
  return (
    !prev ||
    prev.rooms !== next.rooms ||
    prev.doors !== next.doors ||
    prev.features !== next.features ||
    prev.seed !== next.seed ||
    prev.width !== next.width ||
    prev.height !== next.height ||
    prev.themeId !== next.themeId
  );
}

interface Walk {
  path: Cell[];
  start: number;
  onDone: () => void;
}

/**
 * Draws a map onto a canvas. Static layers are rendered once into an offscreen cache at a
 * resolution matched to the zoom level (rebuilt when the map, theme, toggles or zoom
 * bucket change); each frame just blits the cache and draws exit stubs, footprints, the
 * room labels (placed once per cache rebuild), features and the token.
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
  /** Room labels, placed when the cache is rebuilt and drawn every frame over the footprints. */
  private labels: LabelBox[] = [];
  private walk: Walk | null = null;
  private frame = 0;
  private needsDraw = true;
  private lastDraw = -Infinity;
  private overlay: ((ctx: CanvasRenderingContext2D, time: number) => void) | null = null;

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
    this.cancelWalk();
    if (staticChanged(this.map, map)) this.cacheDirty = true;
    this.map = map;
    this.invalidate();
  }

  /** Draw extra content in world units every frame, after the token layer. */
  setOverlay(fn: ((ctx: CanvasRenderingContext2D, time: number) => void) | null): void {
    this.overlay = fn;
    this.invalidate();
  }

  /** Convert page client coordinates to world units, accounting for the canvas position. */
  screenToWorldPoint(clientX: number, clientY: number): Point {
    const r = this.canvas.getBoundingClientRect();
    return screenToWorld(this.cam, { x: clientX - r.left, y: clientY - r.top });
  }

  /** Request a redraw on the next animation frame. */
  invalidate(): void {
    this.needsDraw = true;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.cacheDirty = true;
    this.invalidate();
  }

  setToggles(toggles: DisplayToggles): void {
    this.toggles = { ...toggles };
    this.cacheDirty = true;
    this.invalidate();
  }

  setCamera(cam: Camera): void {
    this.cam = cam;
    this.invalidate();
  }

  /** Size the canvas backing store to its CSS size × devicePixelRatio. */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.invalidate();
  }

  fit(): void {
    if (!this.map) return;
    this.cam = fitCamera(worldBounds(this.map), this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.invalidate();
  }

  /** Animate the token along `path` (starting at the token), then call onDone to commit the move. */
  walkToken(path: Cell[], onDone: () => void): void {
    this.cancelWalk();
    this.walk = { path, start: performance.now(), onDone };
    this.invalidate();
  }

  /** Drop the active walk without calling its onDone. */
  cancelWalk(): void {
    this.walk = null;
    this.invalidate();
  }

  get walking(): boolean {
    return this.walk !== null;
  }

  start(): void {
    const loop = (t: number) => {
      this.frame = requestAnimationFrame(loop);
      const idleDue = !!this.map?.token && this.toggles.token && t - this.lastDraw >= IDLE_FRAME_MS;
      if (!this.needsDraw && !this.walk && !idleDue) return;
      this.needsDraw = false;
      this.lastDraw = t;
      try {
        this.draw(t);
      } catch (err) {
        console.error('Map render failed', err);
      }
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
  }

  private draw(time: number): void {
    const { ctx, map } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.theme.backdrop;
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
    const { ctx } = this;
    const token = this.tokenState(map, time);
    ctx.save();
    drawExitStubs(ctx, exitStubs(map), this.theme, fadedExits(map, token?.at ?? null));
    ctx.restore();
    if (token && this.toggles.footprints) {
      ctx.save();
      drawFootprints(ctx, footprints(map, token.trail, token.at), this.theme);
      ctx.restore();
    }
    // Labels cover the footprints (their boxes are opaque); note pins, stairs and the token stay on top.
    ctx.save();
    drawLabels(ctx, this.labels, this.theme);
    ctx.restore();
    ctx.save();
    drawFeatures(ctx, map.features, this.theme);
    ctx.restore();
    if (token && this.toggles.token) {
      ctx.save();
      drawToken(ctx, token.pos.x, token.pos.y, this.theme, time);
      ctx.restore();
    }
    if (this.overlay) {
      ctx.save();
      this.overlay(ctx, time);
      ctx.restore();
    }
  }

  /**
   * Where the token is drawn this frame. Mid-walk the map already holds the move's result,
   * so the trail is the pre-walk one plus the squares passed so far.
   */
  private tokenState(map: DungeonMap, time: number): { pos: Point; trail: Cell[]; at: Cell } | null {
    const token = map.token;
    if (!token) return null;
    if (!this.walk) return { pos: { x: token.x + 0.5, y: token.y + 0.5 }, trail: token.trail, at: token };
    const { path } = this.walk;
    // rAF timestamps can be slightly earlier than walk.start (performance.now()).
    const travelled = Math.max(0, ((time - this.walk.start) / 1000) * WALK_SPEED);
    const p = pathPosition(path, travelled);
    const passed = Math.min(path.length - 1, Math.floor(travelled));
    const state = { pos: { x: p.x, y: p.y }, trail: walkTrail(token.trail, path, passed), at: path[passed]! };
    if (p.done) {
      const done = this.walk.onDone;
      this.walk = null;
      queueMicrotask(() => {
        try {
          done();
        } catch (err) {
          console.error('Walk completion failed', err);
        }
      });
    }
    return state;
  }

  /** Zoom levels are bucketed (×√2 steps) so panning never re-renders and zooming rarely does. */
  private ensureCache(): void {
    const map = this.map;
    if (!map) return;
    const wanted = Math.min(96, Math.pow(Math.SQRT2, Math.ceil(Math.log(this.cam.scale * this.dpr) / Math.log(Math.SQRT2))));
    const b = worldBounds(map);
    const scale = cacheScaleFor(wanted, b.w, b.h);
    if (!this.cacheDirty && this.cache && scale === this.cacheScale) return;
    if (this.cacheDirty) {
      this.labels = placeLabels(map, canvasMeasure(this.ctx, this.theme));
      // For scripts/visual.mjs: room id, box and whether only the number is shown.
      this.canvas.dataset.labels = this.labels.map((l) => `${l.roomId}:${l.x},${l.y},${l.w},${l.h}${l.badge ? ':badge' : ''}`).join(';');
    }
    const cache = this.cache ?? document.createElement('canvas');
    cache.width = Math.ceil((b.w + 2) * scale);
    cache.height = Math.ceil((b.h + 2) * scale);
    const cctx = cache.getContext('2d');
    if (!cctx) return;
    cctx.setTransform(scale, 0, 0, scale, -(b.x - 1) * scale, -(b.y - 1) * scale);
    renderStatic(cctx, map, this.theme, this.toggles, { exitStubs: false, labels: false, features: false });
    this.cache = cache;
    this.cacheScale = scale;
    this.cacheDirty = false;
  }
}
