import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pub = join(__dirname, '../../public');
const manifest = JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8'));

function pngSize(file: string): string {
  const b = readFileSync(file);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

describe('web app manifest', () => {
  it('has the expected identity and display mode', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toBe('2D6 Map Maker');
    expect(manifest.short_name).toBe('2D6 Map');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });

  it('lists icons that exist with the declared sizes', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of manifest.icons) {
      const file = join(pub, icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      expect(pngSize(file), icon.src).toBe(icon.sizes);
    }
  });

  it('has a 180x180 apple-touch-icon', () => {
    expect(pngSize(join(pub, 'icons/apple-touch-icon.png'))).toBe('180x180');
  });
});
