// A Svelte action drawing a door type's symbol (as the map draws it) in a short stretch of
// wall, for the door-type buttons in the play flow and the Door tool.

import { drawDoorSymbol } from '../render/draw';
import type { Theme } from '../render/theme';
import { SECRET_CHOICE } from './doorChoice';
import { classicTheme } from '../systems/dungeon/classic';

/** CSS px: the symbol canvas is a square this size. */
export const SYMBOL_SIZE = 44;

export function doorSymbol(canvas: HTMLCanvasElement, type: string) {
  const draw = (t: string) => {
    const theme: Theme = classicTheme;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SYMBOL_SIZE * dpr;
    canvas.height = SYMBOL_SIZE * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const unit = SYMBOL_SIZE * 0.6 * dpr;
    ctx.setTransform(unit, 0, 0, unit, (SYMBOL_SIZE * dpr) / 2, (SYMBOL_SIZE * dpr) / 2);
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = theme.wallWidth;
    ctx.beginPath();
    ctx.moveTo(-0.85, 0);
    ctx.lineTo(-0.5, 0);
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.85, 0);
    ctx.stroke();
    drawDoorSymbol(ctx, theme, t === SECRET_CHOICE ? 'wooden' : t, t === SECRET_CHOICE, 0, 0.5);
  };
  draw(type);
  return { update: draw };
}
