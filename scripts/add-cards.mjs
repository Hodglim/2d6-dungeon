// Usage: node scripts/add-cards.mjs <rules.pdf> --kind god|herb --pages N[,N…] --names names.json
//          [--pack local-data/creature-cards.json]
// Adds god or herb cards from your own rulebook PDF to your card pack, for reading in the Tables pane.
// Only the cards named in the --names file are kept (so card backs on the same pages are skipped).
// Re-running for a kind replaces that kind's cards. Needs pdftoppm (poppler) and ImageMagick.
// Contains no rulebook content; see docs/table-file-format.md.
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SLOT_NAMES, requireTools, splitPage } from './card-split.mjs';

const USAGE = 'Usage: node scripts/add-cards.mjs <rules.pdf> --kind god|herb --pages N[,N...] --names names.json [--pack local-data/creature-cards.json]';
const KINDS = ['god', 'herb'];
const KNOWN = ['kind', 'pages', 'names', 'pack', 'help'];

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const args = process.argv.slice(2);
const opt = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    if (!KNOWN.includes(key)) fail(`Unknown option ${args[i]}\n${USAGE}`);
    opt[key] = key === 'help' ? '' : args[++i];
  } else positional.push(args[i]);
}
if (positional.length !== 1 || opt.help !== undefined) fail(USAGE);
const pdf = positional[0];
if (!KINDS.includes(opt.kind)) fail(`--kind must be one of ${KINDS.join(', ')}.\n${USAGE}`);
if (!opt.pages || !/^\d+(,\d+)*$/.test(opt.pages)) fail(`--pages needs page numbers like 44,46.\n${USAGE}`);
if (!opt.names) fail(`--names is required: a JSON file like {"44:1": "Card Name"} (page:slot, slot 1-4 or TL/TR/BL/BR).\n${USAGE}`);
const pages = opt.pages.split(',').map(Number);
const packFile = opt.pack ?? 'local-data/creature-cards.json';

let names;
try {
  names = JSON.parse(readFileSync(opt.names, 'utf8'));
} catch (e) {
  fail(`Could not read the --names file: ${e.message}`);
}

let pack = { format: 1, systemId: 'dungeon', name: 'Cards', cards: [] };
if (existsSync(packFile)) {
  try {
    pack = JSON.parse(readFileSync(packFile, 'utf8'));
  } catch (e) {
    fail(`Could not read the card pack ${packFile}: ${e.message}`);
  }
  if (pack.systemId !== 'dungeon' || !Array.isArray(pack.cards)) fail(`${packFile} is not a card pack.`);
}

const magick = requireTools(fail);
const tmp = mkdtempSync(join(tmpdir(), 'add-cards-'));
const added = [];
const summary = [];
try {
  for (const page of pages) {
    const { boxes, crop } = splitPage({ pdf, page, tmp, magick });
    const labels = [];
    boxes.forEach((_b, i) => {
      const slot = SLOT_NAMES[i] ?? `S${i + 1}`;
      const name = names[`${page}:${i + 1}`] ?? names[`${page}:${slot}`];
      if (!name) return void labels.push(`${slot}=(skipped)`);
      added.push({ id: `${opt.kind}-p${page}-${i + 1}`, name, level: 0, kind: opt.kind, image: crop(i) });
      labels.push(`${slot}=${name}`);
    });
    summary.push(`page ${page}: ${boxes.length} card(s): ${labels.join(', ') || '(none found)'}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (!added.length) fail(`${summary.join('\n')}\nNo named cards were found. Check --pages and the --names file.`);

const kept = pack.cards.filter((c) => c.kind !== opt.kind);
const out = { ...pack, cards: [...kept, ...added] };
mkdirSync(dirname(packFile), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(packFile, json);
console.log(summary.join('\n'));
console.log(`\n${added.length} ${opt.kind} card(s) added (${pack.cards.length - kept.length} replaced); the pack now has ${out.cards.length} cards, ${(Buffer.byteLength(json) / 1048576).toFixed(1)} MiB, written to ${packFile}`);
console.log('Load the pack again from Menu → Load creature cards… to see them in the Tables pane.');
