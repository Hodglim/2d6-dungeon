import { parseCampaign, serializeCampaign, type ParseResult } from '../core/serialize';
import type { Campaign } from '../core/types';

export const MAX_IMPORT_BYTES = 20_000_000;

const pad = (n: number): string => String(n).padStart(2, '0');

/** "2d6-<slug(title)|dungeon>-<YYYY-MM-DD>.2d6map.json", dated by the local calendar day. */
export function exportFileName(title: string, date: Date): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dungeon';
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `2d6-${slug}-${day}.2d6map.json`;
}

/** The current game only; no undo history. */
export function exportCampaignFile(c: Campaign): { name: string; text: string } {
  const map = c.maps.find((m) => m.id === c.activeMapId) ?? c.maps[0];
  return { name: exportFileName(map?.title ?? c.name, new Date()), text: serializeCampaign(c) };
}

/** Size guard first, then the full parseCampaign validation. */
export function readImportText(text: string, byteLength: number): ParseResult {
  if (byteLength > MAX_IMPORT_BYTES) return { ok: false, error: 'This file is too large to be a map file.' };
  return parseCampaign(text);
}
