// Usage: node scripts/check-dist.mjs
// Safety check before publishing: dist/ is what goes on the public internet, so it must contain the app and
// nothing from the private folders (rulebook PDFs, local data, reference, planning notes). Exits 1 on any problem.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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

if (problems.length) {
  console.error('dist check FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const total = files.reduce((n, f) => n + f.size, 0);
console.log(`dist check OK: ${files.length} files, ${(total / 1024).toFixed(1)} KiB`);
