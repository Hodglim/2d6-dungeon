// Usage: node scripts/check-dist.mjs
// Safety check before publishing: dist/ is what goes on the public internet, so it must contain the app and
// nothing from the private folders (rulebook PDFs, local data, reference, planning notes). Exits 1 on any problem.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { cardNames, containsName, tableNames } from './dist-guard.mjs';

const DIST = 'dist';
const FORBIDDEN_DIRS = ['pdf', 'local-data', 'reference', '.superpowers'];
const ALLOWED = [/^index\.html$/, /^sw\.js$/, /^_headers$/, /^manifest\.webmanifest$/, /^icons\/[^/]+\.png$/, /^assets\/[^/]+\.(js|css)$/];
const problems = [];
const files = [];

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(DIST, full).split(sep).join('/');
    if (entry.isDirectory()) {
      if (FORBIDDEN_DIRS.includes(rel.split('/')[0]) || FORBIDDEN_DIRS.includes(entry.name)) problems.push(`forbidden folder in dist: ${rel}/`);
      walk(full);
    } else {
      files.push({ rel, size: statSync(full).size });
      if (/\.pdf$/i.test(entry.name)) problems.push(`PDF in dist: ${rel}`);
      else if (!ALLOWED.some((re) => re.test(rel))) problems.push(`unexpected file in dist: ${rel}`);
    }
  }
};

try {
  walk(DIST);
} catch {
  problems.push(`${DIST}/ does not exist (run npm run build first)`);
}
if (!files.some((f) => f.rel === 'index.html')) problems.push('dist/index.html is missing');

// Rulebook-data guards: the user's own table file and card pack (local-data/) must never leak into dist/.
const MAX_IMAGE_CHUNK = 10 * 1024;
const readJson = (path) => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    problems.push(`${path} exists but is not valid JSON, so it cannot be checked`);
    return null;
  }
};
const tables = readJson('local-data/dungeon-tables.json');
const pack = readJson('local-data/creature-cards.json');
const secrets = [
  ...(tables ? tableNames(tables).map((n) => ({ n, from: 'dungeon-tables.json' })) : []),
  ...(pack ? cardNames(pack).map((n) => ({ n, from: 'creature-cards.json' })) : []),
];
const IMAGE_RE = /data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]*/g;
for (const f of files) {
  if (!/\.(js|css|html|webmanifest)$/.test(f.rel)) continue;
  const text = readFileSync(join(DIST, f.rel), 'utf8');
  for (const m of text.matchAll(IMAGE_RE)) if (m[0].length > MAX_IMAGE_CHUNK) problems.push(`embedded image data (${(m[0].length / 1024).toFixed(0)} kB) in dist/${f.rel}`);
  for (const s of secrets) if (containsName(text, s.n)) problems.push(`rulebook name from local-data/${s.from} found in dist/${f.rel}: "${s.n}"`);
}

if (problems.length) {
  console.error('dist check FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const total = files.reduce((n, f) => n + f.size, 0);
console.log(`dist check OK: ${files.length} files, ${(total / 1024).toFixed(1)} KiB`);
