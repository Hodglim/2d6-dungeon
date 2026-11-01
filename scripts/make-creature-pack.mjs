// Usage: node scripts/make-creature-pack.mjs <codex.pdf> [--first N --last N] [--index-page N]
//          [--names names.json] [--out local-data/creature-cards.json]
// Builds a creature card pack from your own Tables Codex PDF. Needs pdftoppm and pdftotext (poppler) and
// ImageMagick (magick or convert). Contains no rulebook content; see docs/table-file-format.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const USAGE = `Usage: node scripts/make-creature-pack.mjs <codex.pdf> [--first N --last N] [--index-page N] [--names names.json] [--out local-data/creature-cards.json]`;
const DPI = 170;
const CARD_WIDTH = 700;
const QUALITY = 80;
const WHITE = 245; // grey level at or above this counts as paper
const MIN_BLANK_FRACTION = 0.01; // a row/column with less ink than this is a gutter line
const MIN_GAP_FRACTION = 0.008; // a gutter must be at least this fraction of the page
const MIN_CARD_FRACTION = 0.15; // a band narrower than this fraction of the page is not a card

const args = process.argv.slice(2);
const opt = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else positional.push(args[i]);
}
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (positional.length !== 1 || opt.help !== undefined) fail(USAGE);
const pdf = positional[0];
const outFile = opt.out ?? 'local-data/creature-cards.json';

const has = (cmd) => spawnSync(cmd, ['-v'], { stdio: 'ignore' }).error === undefined || spawnSync(cmd, ['--version'], { stdio: 'ignore' }).error === undefined;
for (const tool of ['pdftoppm', 'pdftotext']) {
  if (!has(tool)) fail(`${tool} was not found. Install poppler (poppler-utils) and try again.`);
}
const magick = ['magick', 'convert'].find(has);
if (!magick) fail('ImageMagick was not found (neither "magick" nor "convert"). Install ImageMagick and try again.');

const text = (first, last) => execFileSync('pdftotext', ['-layout', '-f', String(first), '-l', String(last), pdf, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const pageText = (n) => text(n, n);

// --- creature index ---
let nameOverrides = {};
if (opt.names) {
  try {
    nameOverrides = JSON.parse(readFileSync(opt.names, 'utf8'));
  } catch (e) {
    fail(`Could not read the --names file: ${e.message}`);
  }
}

const pageCount = Number(/^Pages:\s+(\d+)/m.exec(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }))?.[1] ?? 0);
let indexPage = opt['index-page'] ? Number(opt['index-page']) : 0;
if (!indexPage) {
  for (let p = 1; p <= pageCount; p++) {
    if (/Creature Index/i.test(pageText(p)) && /Creature\s+Page/i.test(pageText(p))) {
      indexPage = p;
      break;
    }
  }
}
if (!indexPage) fail('Could not find the "Creature Index" page. Pass --index-page N.');

/** Parse "Name   Page   Name   Page" lines into [{name, page}]. */
function parseIndex(t) {
  const out = [];
  for (const line of t.split('\n')) {
    if (/^\s*Creature\s+Page/i.test(line)) continue;
    for (const tok of line.trim().split(/\s{2,}/)) {
      const m = /^(.*\S)\s+(\d{1,4})$/.exec(tok);
      if (m) out.push({ name: m[1].trim(), page: Number(m[2]) });
    }
    // pairs split as separate tokens: "Name", "102"
    const toks = line.trim().split(/\s{2,}/);
    for (let i = 0; i + 1 < toks.length; i++) {
      if (!/^\d{1,4}$/.test(toks[i]) && /^\d{1,4}$/.test(toks[i + 1]) && /^[^\d]/.test(toks[i])) out.push({ name: toks[i].trim(), page: Number(toks[i + 1]) });
    }
  }
  // de-duplicate (the two passes can both match "Name 102")
  const seen = new Set();
  return out.filter((e) => (seen.has(`${e.name}|${e.page}`) ? false : seen.add(`${e.name}|${e.page}`)));
}
let entries = parseIndex(pageText(indexPage));
for (let p = indexPage + 1; p <= pageCount; p++) {
  const more = parseIndex(pageText(p));
  if (more.length < 2 || /LEVEL\s+\d+/i.test(pageText(p))) break;
  entries = entries.concat(more);
}
if (!entries.length) fail(`No creature entries found on page ${indexPage}.`);

const namesByPage = new Map();
for (const e of entries) {
  if (!namesByPage.has(e.page)) namesByPage.set(e.page, []);
  namesByPage.get(e.page).push(e.name);
}
for (const list of namesByPage.values()) list.sort((a, b) => a.localeCompare(b));
const pages = [...namesByPage.keys()].sort((a, b) => a - b);
const first = opt.first ? Number(opt.first) : pages[0];
const last = opt.last ? Number(opt.last) : pages[pages.length - 1];

// --- image helpers ---
const SLOT_NAMES = ['TL', 'TR', 'BL', 'BR'];
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
function readGray(file) {
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

// --- render, split, encode ---
const tmp = mkdtempSync(join(tmpdir(), 'creature-pack-'));
const cards = [];
const summary = [];
try {
  for (let page = first; page <= last; page++) {
    const level = Number(/LEVEL\s+(\d+)\s*[-–—]\s*CREATURE CARDS/i.exec(pageText(page))?.[1]);
    const base = join(tmp, `p${page}`);
    execFileSync('pdftoppm', ['-r', String(DPI), '-png', '-f', String(page), '-l', String(page), '-singlefile', pdf, base]);
    const png = `${base}.png`;
    const boxes = cardBoxes(readGray(png));
    const names = namesByPage.get(page) ?? [];
    const matched = names.length === boxes.length;
    if (!matched) console.warn(`warning: page ${page} has ${boxes.length} card(s) but the index lists ${names.length}; naming them "Page ${page} card K".`);
    if (!Number.isFinite(level)) console.warn(`warning: page ${page} has no "LEVEL n - CREATURE CARDS" heading; using level 0.`);
    const labels = [];
    boxes.forEach((b, i) => {
      const slot = SLOT_NAMES[i] ?? `S${i + 1}`;
      const name = nameOverrides[`${page}:${i + 1}`] ?? nameOverrides[`${page}:${slot}`] ?? (matched ? names[i] : `Page ${page} card ${i + 1}`);
      const jpg = join(tmp, `p${page}-${i + 1}.jpg`);
      execFileSync(magick, [png, '-crop', `${b.w}x${b.h}+${b.x}+${b.y}`, '+repage', '-resize', `${CARD_WIDTH}x`, '-quality', String(QUALITY), jpg]);
      cards.push({ id: `p${page}-${i + 1}`, name, level: Number.isFinite(level) ? level : 0, image: `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}` });
      labels.push(`${slot}=${name}`);
    });
    summary.push(`page ${page}: ${labels.join(', ') || '(no cards found)'}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (!cards.length) fail('No cards were found. Check --first/--last and the PDF.');

const pack = { format: 1, systemId: 'dungeon', name: 'Creature cards', cards };
mkdirSync(dirname(outFile), { recursive: true });
const json = JSON.stringify(pack);
writeFileSync(outFile, json);
console.log(summary.join('\n'));
console.log(`\n${cards.length} cards from pages ${first}-${last}, ${(Buffer.byteLength(json) / 1048576).toFixed(1)} MiB, written to ${outFile}`);
console.log('Check the names above against the book. To fix a wrong one, make a JSON file like {"102:2": "Right Name"} (page:slot, slot 1-4 or TL/TR/BL/BR) and re-run with --names that file.');
