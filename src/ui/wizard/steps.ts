/** Pure step logic for the hero creation wizard. */
import { MAX_MAP_SIZE } from '../../core/campaign';
import { creationProblem } from '../../systems/dungeon/hero';
import type { DungeonTables } from '../../systems/dungeon/tables';

export type WizardStep = 'game' | 'name' | 'weapon' | 'armour' | 'scroll' | 'review';
export type WizardMode = 'new-game' | 'add-hero';

export const MIN_MAP_SIZE = 20;
export { MAX_MAP_SIZE };

export interface WizardDraft {
  width: number;
  height: number;
  title: string;
  name: string;
  weapon: string;
  manoeuvres: string[];
  armour: string;
  scroll: string;
}

export const emptyDraft = (): WizardDraft => ({ width: 25, height: 25, title: '', name: '', weapon: '', manoeuvres: [], armour: '', scroll: '' });

const HERO_STEPS: WizardStep[] = ['name', 'weapon', 'armour', 'scroll', 'review'];

/** Add-hero skips the Game step: the map is already there. */
export const wizardSteps = (mode: WizardMode): WizardStep[] => (mode === 'new-game' ? ['game', ...HERO_STEPS] : HERO_STEPS);

export function sizeProblem(name: string, v: unknown): string | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_MAP_SIZE && v <= MAX_MAP_SIZE
    ? null
    : `${name} must be a whole number from ${MIN_MAP_SIZE} to ${MAX_MAP_SIZE}`;
}

export const mapSizeProblem = (d: WizardDraft): string | null => sizeProblem('Width', d.width) ?? sizeProblem('Height', d.height);

/** The number of manoeuvres a new hero picks. */
export const startingManoeuvreCount = (t: DungeonTables): number =>
  t.tables.levels.find((l) => l.level === t.tables.starting.level)!.manoeuvres;

/** Level 1 manoeuvres of the chosen weapon (the ones a new hero may pick from). */
export function pickableManoeuvres(t: DungeonTables, weapon: string) {
  return t.tables.weapons.find((w) => w.name === weapon)?.manoeuvres.filter((m) => m.level === t.tables.starting.level) ?? [];
}

export function wizardStepValid(step: WizardStep, d: WizardDraft, t: DungeonTables | null): boolean {
  if (step === 'game') return mapSizeProblem(d) === null && t !== null;
  if (!t) return false;
  switch (step) {
    case 'name':
      return d.name.trim().length > 0;
    case 'weapon': {
      if (!t.tables.weapons.some((w) => w.name === d.weapon)) return false;
      const names = new Set(pickableManoeuvres(t, d.weapon).map((m) => m.name));
      return d.manoeuvres.length === startingManoeuvreCount(t) && d.manoeuvres.every((n) => names.has(n));
    }
    case 'armour':
      return t.tables.startingArmour.some((a) => a.name === d.armour);
    case 'scroll':
      return t.tables.startingScrolls.some((s) => s.name === d.scroll);
    case 'review':
      return creationProblem(t, { ...d, name: d.name.trim() }) === null && d.name.trim().length > 0;
  }
}

/** Toggle a manoeuvre; picks past the limit are ignored. */
export function toggleManoeuvre(picked: string[], name: string, limit: number): string[] {
  if (picked.includes(name)) return picked.filter((n) => n !== name);
  return picked.length >= limit ? picked : [...picked, name];
}
