// Shared by make-creature-pack.mjs and add-cards.mjs: find ImageMagick, split a rendered book page into
// its cards (by the white gutters between them), and crop one card to a JPEG data URL.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DPI = 170;
const CARD_WIDTH = 700;
const QUALITY = 80;
const WHITE = 245; // grey level at or above this counts as paper
const MIN_BLANK_FRACTION = 0.01; // a row/column with less ink than this is a gutter line
const MIN_GAP_FRACTION = 0.004; // a gutter must be at least this fraction of the page (some books leave only a few px)
const MIN_CARD_FRACTION = 0.15; // a band narrower than this fraction of the page is not a card

export const SLOT_NAMES = ['TL', 'TR', 'BL', 'BR'];

export const has = (cmd) => spawnSync(cmd, ['-v'], { stdio: 'ignore' }).error === undefined || spawnSync(cmd, ['--version'], { stdio: 'ignore' }).error === undefined;

/** Checks poppler is installed and returns the ImageMagick command; calls fail(msg) when something is missing. */
export function requireTools(fail) {
  for (const tool of ['pdftoppm', 'pdftotext', 'pdfinfo']) {
    if (!has(tool)) fail(`${tool} was not found. Install poppler (poppler-utils) and try again.`);
  }
  const magick = ['magick', 'convert'].find(has);
  if (!magick) fail('ImageMagick was not found (neither "magick" nor "convert"). Install ImageMagick and try again.');
  return magick;
}

/** Runs of true in a boolean array as [start,end) pairs. */
const runs = (flags) => {
  const r = [];
  let s = -1;
  flags.forEach((f, i) => {
    if (f && s < 0) s = i;
    if (!f && s >= 0) (r.push([s, i]), (s = -1));
  });
  if (s >= 0) r.push([s, flags.length]);
  return r;
};
/** Content bands along one axis, separated by gutters, dropping bands that are too small to be a card. */
function bands(inkFractions, total) {
  const minGap = Math.max(2, Math.round(total * MIN_GAP_FRACTION));
  const ink = inkFractions.map((f) => f >= MIN_BLANK_FRACTION);
  // close gaps shorter than a gutter so thin white lines inside a card do not split it
  const closed = [...ink];
  for (const [s, e] of runs(ink.map((v) => !v))) if (e - s < minGap && s > 0 && e < total) for (let i = s; i < e; i++) closed[i] = true;
  return runs(closed).filter(([s, e]) => e - s >= total * MIN_CARD_FRACTION);
}
function readGray(magick, file) {
  const buf = execFileSync(magick, [file, '-colorspace', 'Gray', '-depth', '8', 'pgm:-'], { maxBuffer: 1 << 28 });
  const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(buf.subarray(0, 40).toString('latin1'));
  if (!m) throw new Error('unexpected image format from ImageMagick');
  const w = Number(m[1]);
  const h = Number(m[2]);
  return { w, h, px: buf.subarray(buf.length - w * h) };
}
function cardBoxes({ w, h, px }) {
  const rowInk = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (px[y * w + x] < WHITE) n++;
    rowInk[y] = n / w;
  }
  const boxes = [];
  for (const [y0, y1] of bands(rowInk, h)) {
    const colInk = new Array(w).fill(0);
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let y = y0; y < y1; y++) if (px[y * w + x] < WHITE) n++;
      colInk[x] = n / (y1 - y0);
    }
    for (const [x0, x1] of bands(colInk, w)) boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return boxes;
}

/**
 * Renders one page into `tmp` and splits it into cards, top-left to bottom-right.
 * Returns the boxes and crop(i), which writes card i as a JPEG and returns its data URL.
 */
export function splitPage({ pdf, page, tmp, magick }) {
  const base = join(tmp, `p${page}`);
  execFileSync('pdftoppm', ['-r', String(DPI), '-png', '-f', String(page), '-l', String(page), '-singlefile', pdf, base]);
  const png = `${base}.png`;
  const boxes = cardBoxes(readGray(magick, png));
  const crop = (i) => {
    const b = boxes[i];
    const jpg = join(tmp, `p${page}-${i + 1}.jpg`);
    execFileSync(magick, [png, '-crop', `${b.w}x${b.h}+${b.x}+${b.y}`, '+repage', '-resize', `${CARD_WIDTH}x`, '-quality', String(QUALITY), jpg]);
    return `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`;
  };
  return { boxes, crop };
}
