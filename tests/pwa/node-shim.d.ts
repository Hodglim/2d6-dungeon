// Minimal Node typings for the manifest test (the project deliberately has no @types/node).
declare module 'node:fs' {
  export function readFileSync(path: string | URL): { readUInt32BE(offset: number): number };
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, opts?: { recursive: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
  export function existsSync(path: string): boolean;
}
declare module 'node:path' {
  export function relative(from: string, to: string): string;
  export const sep: string;
  export function join(...parts: string[]): string;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
declare const __dirname: string;
declare module 'node:crypto' {
  export function createHash(alg: string): { update(d: string | object): { update(d: string | object): any }; digest(enc: 'hex'): string };
}
