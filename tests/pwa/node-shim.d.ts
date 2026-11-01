// Minimal Node typings for the manifest test (the project deliberately has no @types/node).
declare module 'node:fs' {
  export function readFileSync(path: string): { readUInt32BE(offset: number): number };
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function existsSync(path: string): boolean;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare const __dirname: string;
