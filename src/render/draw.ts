// Canvas drawing for each layer. Every function expects the context to be transformed so
// that one unit = one grid square. These are not unit-tested; they are checked visually.
import type { DungeonMap, Feature } from '../core/types';
import { worldBounds } from './camera';
import type { DoorGlyph, ExitStub } from './doors';
import type { Decal, FloorTile } from './floor';
import type { Stroke } from './hatching';
import type { LabelBox } from './labels';
import { mulberry32 } from './rng';
import type { Theme } from './theme';
import type { Footprint } from './token';
import type { Segment, ShadowEdge } from './walls';

export const LABEL_FONT_SIZE = 0.34;
export const LABEL_PAD_X = 0.1;
export const LABEL_PAD_Y = 0.06;

/** Canvas fonts misbehave below 1px, so text is drawn at 100× and scaled back down. */
const TEXT_SCALE = 100;

export function fillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  font: string,
  weight = '',
): void {
  ctx.save();
  ctx.scale(1 / TEXT_SCALE, 1 / TEXT_SCALE);
  ctx.font = `${weight} ${size * TEXT_SCALE}px ${font}`.trim();
  ctx.fillText(text, x * TEXT_SCALE, y * TEXT_SCALE);
  ctx.restore();
}

/** Width of `text` in grid units at `size` grid units. */
export function measureText(ctx: CanvasRenderingContext2D, text: string, size: number, font: string): number {
  ctx.save();
  ctx.font = `${size * TEXT_SCALE}px ${font}`;
  const w = ctx.measureText(text).width / TEXT_SCALE;
  ctx.restore();
  return w;
}

export function drawPaper(ctx: CanvasRenderingContext2D, map: DungeonMap, theme: Theme, grid: boolean): void {
  const b = worldBounds(map);
  ctx.fillStyle = theme.paper;
  ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  if (grid) {
    ctx.fillStyle = theme.gridDot;
    const r = 0.03;
    ctx.beginPath();
    for (let y = b.y; y <= b.y + b.h; y++) {
      for (let x = b.x; x <= b.x + b.w; x++) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
  ctx.save();
  ctx.strokeStyle = theme.boundary;
  ctx.lineWidth = 0.025;
  ctx.setLineDash([0.08, 0.08]);
  ctx.strokeRect(0, 0, map.width, map.height);
  ctx.restore();
}

export function drawHatching(ctx: CanvasRenderingContext2D, strokes: Stroke[], theme: Theme): void {
  ctx.strokeStyle = theme.hatch;
  ctx.lineWidth = 0.016;
  ctx.lineCap = 'round';
  // Batch by alpha to keep this fast with thousands of strokes.
  const byAlpha = new Map<number, Stroke[]>();
  for (const s of strokes) {
    const a = Math.round(s.alpha * 10) / 10;
    const list = byAlpha.get(a) ?? [];
    list.push(s);
    byAlpha.set(a, list);
  }
  for (const [alpha, list] of byAlpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (const s of list) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawFloors(ctx: CanvasRenderingContext2D, tiles: FloorTile[], theme: Theme): void {
  for (const t of tiles) {
    ctx.fillStyle = theme.floor[t.shade] ?? theme.floor[0] ?? '#fff';
    // Slight overdraw hides hairline seams between tiles.
    ctx.fillRect(t.x - 0.005, t.y - 0.005, 1.01, 1.01);
  }
}

export function drawDecals(ctx: CanvasRenderingContext2D, decals: Decal[], theme: Theme): void {
  ctx.strokeStyle = theme.decal;
  ctx.fillStyle = theme.decal;
  ctx.lineWidth = 0.018;
  ctx.lineCap = 'round';
  for (const d of decals) {
    const rng = mulberry32(d.seed);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    if (d.kind === 'crack') {
      ctx.beginPath();
      ctx.moveTo(-d.size, 0);
      let x = -d.size;
      while (x < d.size) {
        x += d.size / 3;
        ctx.lineTo(x, (rng() - 0.5) * d.size * 0.6);
      }
      ctx.stroke();
    } else if (d.kind === 'stain') {
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(0, 0, d.size, d.size * (0.6 + rng() * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc((rng() - 0.5) * d.size * 1.5, (rng() - 0.5) * d.size * 1.5, 0.02 + rng() * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

export function drawShadows(ctx: CanvasRenderingContext2D, shadows: ShadowEdge[], theme: Theme): void {
  const depth = 0.32;
  for (const { seg, inward } of shadows) {
    const horizontal = seg.y1 === seg.y2;
    const sign = inward === 'S' || inward === 'E' ? 1 : -1;
    const x0 = seg.x1;
    const y0 = seg.y1;
    const g = horizontal
      ? ctx.createLinearGradient(0, y0, 0, y0 + depth * sign)
      : ctx.createLinearGradient(x0, 0, x0 + depth * sign, 0);
    g.addColorStop(0, theme.shadow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    if (horizontal) ctx.fillRect(seg.x1, Math.min(y0, y0 + depth * sign), seg.x2 - seg.x1, depth);
    else ctx.fillRect(Math.min(x0, x0 + depth * sign), seg.y1, depth, seg.y2 - seg.y1);
  }
}

export function drawWalls(ctx: CanvasRenderingContext2D, segments: Segment[], theme: Theme): void {
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = theme.wallWidth;
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (const s of segments) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.stroke();
}

export function drawDoors(ctx: CanvasRenderingContext2D, glyphs: DoorGlyph[], theme: Theme): void {
  for (const g of glyphs) {
    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.rotate(g.rotation);
    if (g.secret) {
      // A secret door reads as wall with an "S".
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = theme.wallWidth;
      ctx.beginPath();
      ctx.moveTo(-0.5, 0);
      ctx.lineTo(0.5, 0);
      ctx.stroke();
      ctx.rotate(-g.rotation);
      ctx.fillStyle = theme.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fillText(ctx, 'S', 0, 0.02, 0.3, theme.labelFont, 'bold');
    } else {
      (theme.doorSymbols[g.type] ?? theme.doorSymbols.archway)?.(ctx, theme);
    }
    ctx.restore();
    if (g.locked !== null) drawLock(ctx, g, theme);
  }
}

function drawLock(ctx: CanvasRenderingContext2D, g: DoorGlyph, theme: Theme): void {
  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.rotate(g.rotation);
  ctx.translate(0, 0.26);
  ctx.rotate(-g.rotation);
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 0.03;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (g.locked) {
    // Closed shackle: both legs seated in the body.
    ctx.moveTo(-0.05, -0.04);
    ctx.arc(0, -0.04, 0.05, Math.PI, 0);
  } else {
    // Open shackle: swung up and clear of the left side.
    ctx.moveTo(0.05, -0.04);
    ctx.lineTo(0.05, -0.1);
    ctx.arc(0, -0.1, 0.05, 0, Math.PI, true);
    ctx.lineTo(-0.05, -0.075);
  }
  ctx.stroke();
  ctx.fillStyle = g.locked ? theme.ink : theme.paper;
  ctx.fillRect(-0.075, -0.04, 0.15, 0.11);
  ctx.strokeRect(-0.075, -0.04, 0.15, 0.11);
  if (g.quality !== null) {
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    fillText(ctx, String(g.quality), 0.12, 0.02, 0.2, theme.labelFont, 'bold');
  }
  ctx.restore();
}

export function drawExitStubs(ctx: CanvasRenderingContext2D, stubs: ExitStub[], theme: Theme, faded: Set<string>): void {
  for (const s of stubs) {
    const colour = faded.has(s.doorId) ? theme.accentFaded : theme.accent;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(s.cx, s.cy);
    ctx.lineTo(s.cx + s.dx * 0.55, s.cy + s.dy * 0.55);
    ctx.stroke();
    ctx.fillRect(s.cx - 0.1, s.cy - 0.1, 0.2, 0.2);
  }
}

export function drawFeatures(ctx: CanvasRenderingContext2D, features: Feature[], theme: Theme): void {
  ctx.strokeStyle = theme.ink;
  ctx.fillStyle = theme.ink;
  ctx.lineWidth = 0.035;
  for (const f of features) {
    if (f.kind === 'stairs') {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const y = f.y + 0.18 + i * 0.16;
        const inset = f.dir === 'down' ? i * 0.04 : (4 - i) * 0.04;
        ctx.moveTo(f.x + 0.15 + inset, y);
        ctx.lineTo(f.x + 0.85 - inset, y);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(f.x + 0.5, f.y + 0.4, 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(f.x + 0.5, f.y + 0.5);
      ctx.lineTo(f.x + 0.5, f.y + 0.78);
      ctx.stroke();
    }
  }
}

export function drawLabels(ctx: CanvasRenderingContext2D, boxes: LabelBox[], theme: Theme): void {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.globalAlpha = 1; // opaque boxes: footprints and floor never show through
  for (const b of boxes) {
    ctx.fillStyle = theme.labelFill;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 0.025;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = theme.labelText;
    const lineH = b.h / b.lines.length;
    for (const [i, line] of b.lines.entries()) {
      // A number-only badge is bold so it reads as a key to tap, not as a short name.
      fillText(ctx, line, b.x + b.w / 2, b.y + lineH * (i + 0.5) + 0.01, LABEL_FONT_SIZE, theme.labelFont, b.badge ? 'bold' : '');
    }
  }
}

export function drawFootprints(ctx: CanvasRenderingContext2D, prints: Footprint[], theme: Theme): void {
  ctx.fillStyle = theme.footprint;
  for (const p of prints) {
    ctx.save();
    ctx.globalAlpha = 1 - p.age * 0.75;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.ellipse(0.03, 0, 0.09, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-0.1, 0, 0.042, 0.036, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function drawToken(ctx: CanvasRenderingContext2D, x: number, y: number, theme: Theme, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time / 300);
  ctx.fillStyle = theme.token;
  ctx.globalAlpha = 0.15 + 0.15 * pulse;
  ctx.beginPath();
  ctx.arc(x, y, 0.28 + 0.08 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.tokenText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fillText(ctx, 'P', x, y + 0.015, 0.26, theme.labelFont, 'bold');
}
