import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Writes outDir/sw.js listing every other output file; the cache name hashes their names and contents. */
export function emitServiceWorker(outDir: string): void {
  const files = walk(outDir)
    .map((f) => relative(outDir, f).split(sep).join('/'))
    .filter((f) => f !== 'sw.js' && f !== '_headers')
    .sort();
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
  const cache = `2d6-${hash.digest('hex').slice(0, 16)}`;
  const tpl = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
  writeFileSync(join(outDir, 'sw.js'), tpl.replace('__CACHE__', cache).replace('__PRECACHE__', JSON.stringify(files)));
}

export function pwaPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: '2d6-pwa-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    writeBundle() {
      emitServiceWorker(outDir);
    },
  };
}
