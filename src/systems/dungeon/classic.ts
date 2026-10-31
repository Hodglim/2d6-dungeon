import type { DoorSymbol, Theme } from '../../render/theme';

// Door symbols are drawn with the door running along x from -0.5 to 0.5 (grid units),
// centred on the wall, with +y pointing into the room. Walls stop at the door's edge.

const LW = 0.045;

function slab(fill: string, depth: number, extra?: (ctx: CanvasRenderingContext2D) => void): DoorSymbol {
  return (ctx, theme) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = LW;
    ctx.beginPath();
    ctx.rect(-0.36, -depth / 2, 0.72, depth);
    ctx.fill();
    ctx.stroke();
    extra?.(ctx);
    jambs(ctx, theme);
  };
}

function jambs(ctx: CanvasRenderingContext2D, theme: Theme): void {
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = theme.wallWidth;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const x of [-0.5, 0.5]) {
    ctx.moveTo(x, -0.13);
    ctx.lineTo(x, 0.13);
  }
  ctx.stroke();
}

const archway: DoorSymbol = (ctx, theme) => {
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = LW;
  ctx.beginPath();
  ctx.moveTo(-0.5, 0);
  ctx.quadraticCurveTo(0, 0.32, 0.5, 0);
  ctx.stroke();
  jambs(ctx, theme);
};

const curtain: DoorSymbol = (ctx, theme) => {
  ctx.strokeStyle = '#7a3b2e';
  ctx.lineWidth = LW * 1.6;
  ctx.beginPath();
  ctx.moveTo(-0.42, 0);
  for (let i = 0; i < 6; i++) {
    const x = -0.42 + (i + 1) * 0.14;
    ctx.quadraticCurveTo(x - 0.07, i % 2 === 0 ? -0.1 : 0.1, x, 0);
  }
  ctx.stroke();
  jambs(ctx, theme);
};

const portcullis: DoorSymbol = (ctx, theme) => {
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = LW;
  ctx.fillStyle = theme.floor[0] ?? '#fff';
  ctx.beginPath();
  ctx.rect(-0.36, -0.08, 0.72, 0.16);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const x = -0.36 + i * 0.12;
    ctx.moveTo(x, -0.08);
    ctx.lineTo(x, 0.08);
  }
  ctx.stroke();
  jambs(ctx, theme);
};

const bands = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  for (const x of [-0.18, 0, 0.18]) {
    ctx.moveTo(x, -0.09);
    ctx.lineTo(x, 0.09);
  }
  ctx.stroke();
};

const midline = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  ctx.moveTo(-0.36, 0);
  ctx.lineTo(0.36, 0);
  ctx.stroke();
};

export const classicTheme: Theme = {
  id: 'classic',
  name: 'Classic',
  backdrop: '#e9e9e6',
  paper: '#ffffff',
  gridDot: 'rgba(60, 60, 60, 0.35)',
  boundary: 'rgba(60, 60, 60, 0.45)',
  floor: ['#f8f8f6', '#f4f4f1', '#f0f0ec'],
  decal: 'rgba(70, 70, 70, 0.28)',
  ink: '#1b1b1b',
  hatch: '#2a2a2a',
  shadow: 'rgba(0, 0, 0, 0.22)',
  accent: '#1f8a3a',
  accentFaded: 'rgba(31, 138, 58, 0.35)',
  labelFill: '#ffffff',
  labelText: '#1b1b1b',
  labelFont: '"Segoe UI", system-ui, sans-serif',
  token: '#2b2b2b',
  tokenText: '#ffffff',
  footprint: 'rgba(80, 80, 80, 0.7)',
  wallWidth: 0.07,
  hatchReach: 1.6,
  rockStyle: 'hatch',
  doorSymbols: {
    archway,
    wooden: slab('#9a6a3a', 0.18),
    metal: slab('#9aa1a8', 0.16, midline),
    reinforced: slab('#7b5530', 0.2, bands),
    curtain,
    portcullis,
    stoneSlab: slab('#6f6f6f', 0.26),
  },
};
