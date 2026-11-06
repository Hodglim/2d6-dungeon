// Usage:
//   node scripts/check-book-terms.mjs --all              every tracked file (npm run check:terms)
//   node scripts/check-book-terms.mjs --staged           lines added in the staged changes (pre-commit hook)
//   node scripts/check-book-terms.mjs --message <file>   a commit message (commit-msg hook)
//   node scripts/check-book-terms.mjs --push             commits about to be pushed, read from stdin (pre-push hook)
//
// Keeps rulebook terms out of git. The terms are read at run time from the player's own data in
// local-data/ (git-ignored), so this script and the repo never hold them. Without local-data/ it
// can't check, says so, and passes. Generic words that may appear go in scripts/book-terms-allow.json.
// Exits 1 when it finds a term.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { addedLines, bookTerms, findTerms } from './dist-guard.mjs';

const readJson = (path) => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    console.error(`check-book-terms: ${path} is not valid JSON, so it can't be read`);
    process.exit(1);
  }
};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const tables = readJson('local-data/dungeon-tables.json');
if (!tables) {
  console.log('check-book-terms: no local-data/dungeon-tables.json here, so rulebook terms were not checked.');
  process.exit(0);
}
const terms = bookTerms({
  tables,
  pack: readJson('local-data/creature-cards.json'),
  nameMaps: ['creature-names', 'god-names', 'herb-names'].map((n) => readJson(`local-data/${n}.json`)).filter(Boolean),
  allow: readJson('scripts/book-terms-allow.json') ?? [],
});

/** Lines to scan: { where, text }. */
const lines = [];
const fromText = (where, text) => text.split('\n').forEach((t, i) => lines.push({ where: `${where}:${i + 1}`, text: t }));
const fromDiff = (diff) => addedLines(diff).forEach((l) => lines.push({ where: l.file, text: l.text }));
const isText = (buf) => !buf.subarray(0, 8000).includes(0);

const [mode, arg] = process.argv.slice(2);
if (mode === '--all') {
  for (const f of git('ls-files', '-z').split('\0').filter(Boolean)) {
    if (!existsSync(f)) continue;
    const buf = readFileSync(f);
    if (isText(buf)) fromText(f, buf.toString('utf8'));
  }
} else if (mode === '--staged') {
  fromDiff(git('diff', '--cached', '--no-color', '--no-ext-diff', '-U0'));
} else if (mode === '--message' && arg) {
  fromText('commit message', readFileSync(arg, 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n'));
} else if (mode === '--push') {
  const ZERO = /^0+$/;
  for (const line of readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
    const [, localSha, , remoteSha] = line.split(' ');
    if (!localSha || ZERO.test(localSha)) continue; // a branch being deleted
    // A new branch: everything not already on a remote. Otherwise: what is new since the remote's tip.
    const range = !remoteSha || ZERO.test(remoteSha) ? [localSha, '--not', '--remotes'] : [`${remoteSha}..${localSha}`];
    for (const sha of git('rev-list', ...range).split('\n').filter(Boolean)) {
      fromText(`commit ${sha.slice(0, 7)} message`, git('log', '-1', '--format=%B', sha));
      fromDiff(git('show', '--format=', '--no-color', '--no-ext-diff', '-U0', '--root', sha));
    }
  }
} else {
  console.error('Usage: node scripts/check-book-terms.mjs --all | --staged | --message <file> | --push');
  process.exit(2);
}

const hits = [];
for (const l of lines) for (const t of findTerms(l.text, terms)) hits.push(`  ${l.where}: "${t}"`);
if (hits.length === 0) process.exit(0);
console.error(`Rulebook terms found (${hits.length}). Use made-up names and codes instead (e.g. XX1, Grumbler):`);
console.error([...new Set(hits)].slice(0, 50).join('\n'));
if (hits.length > 50) console.error(`  ... and ${hits.length - 50} more`);
console.error('A generic word that is fine to use can go in scripts/book-terms-allow.json.');
process.exit(1);
