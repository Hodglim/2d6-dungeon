import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitServiceWorker } from '../../scripts/pwaPlugin';

function fakeDist(js: string): string {
  const dir = mkdtempSync(join(tmpdir(), '2d6-sw-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<html></html>');
  writeFileSync(join(dir, '_headers'), '/ x');
  writeFileSync(join(dir, 'assets/app.js'), js);
  emitServiceWorker(dir);
  return readFileSync(join(dir, 'sw.js'), 'utf8');
}
const cacheOf = (sw: string) => /const CACHE = '([^']+)'/.exec(sw)?.[1];
const listOf = (sw: string): string[] => JSON.parse(/const PRECACHE = (\[.*?\]);/.exec(sw)![1]!);

describe('service worker emission', () => {
  it('precaches the build but not sw.js or _headers', () => {
    const list = listOf(fakeDist('a'));
    expect(list).toEqual(['assets/app.js', 'index.html']);
  });
  it('changes the cache name when any file content changes', () => {
    const a = cacheOf(fakeDist('a'));
    expect(a).toMatch(/^2d6-[0-9a-f]{16}$/);
    expect(cacheOf(fakeDist('a'))).toBe(a);
    expect(cacheOf(fakeDist('b'))).not.toBe(a);
  });
  it('leaves no placeholders behind', () => {
    const sw = fakeDist('a');
    expect(sw).not.toMatch(/'__CACHE__'|= __PRECACHE__/);
  });
});
