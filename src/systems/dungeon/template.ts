/**
 * A blank table file for players to fill in from their own books: every table, key and
 * field is present, with empty values. It holds no rulebook content. Lists whose length
 * depends on the book (weapons, levels, gods ...) have one blank row to copy.
 * The app refuses it until the blanks are filled, and names the first one it finds.
 */

const D66_KEYS = [1, 2, 3, 4, 5, 6].flatMap((a) => [1, 2, 3, 4, 5, 6].map((b) => `${a}${b}`));
const TWO_D6_KEYS = Array.from({ length: 11 }, (_, i) => String(i + 2));

export const TEMPLATE_FILE_NAME = '2d6-dungeon-tables-blank.json';

const keyed = <T>(keys: string[], make: () => T): Record<string, T> => Object.fromEntries(keys.map((k) => [k, make()]));
const room = () => ({ type: '', description: '', encounter: '', exit: { door: '' } as { door: string } | string, unique: null as boolean | null });
const smallRoom = () => ({ type: '', description: '', unique: null as boolean | null });

export function blankTableFile() {
  return {
    format: 1,
    systemId: 'dungeon',
    name: 'My tables',
    tables: {
      starting: {
        level: null, xp: null, shift: null, discipline: null, precision: null, hp: null, rations: null,
        potions: [{ name: '', effect: '' }],
        kit: [''],
      },
      startingArmour: [{ name: '', dice: [] as number[], modifier: '' }],
      startingScrolls: [{ name: '', effect: '', orbit: '', dispelDoubles: '', effectModifier: '' }],
      weapons: [{ name: '', manoeuvres: [{ level: null, name: '', dice: [] as number[], damage: '' }] }],
      levels: [{
        level: null, title: '', manoeuvres: null, maxManoeuvreLevel: null, xpToLevelUp: null,
        shift: null, discipline: null, precision: null, hpBaseline: null,
      }],
      gods: [''],
      conditions: {
        bloodied: { label: '', boxes: null },
        soaked: { label: '', boxes: null },
        fever: { label: '', effect: '' },
        pneumonia: { label: '', effect: '' },
      },
      favourBoxes: null,
      limits: { potions: null, scrolls: null, largeItems: null, armour: null },
      dungeonLevels: [{
        level: 1,
        name: '',
        exitTable: 'EXT1',
        rooms: keyed(D66_KEYS, room),
        smallRooms: keyed(TWO_D6_KEYS, smallRoom),
        largeRooms: keyed(TWO_D6_KEYS, room),
      }],
      exitTables: { EXT1: keyed(D66_KEYS, () => ({ door: '' })) } as Record<string, Record<string, { door: string; locked?: boolean }>>,
      creatureTables: { L1X: keyed(['1', '2', '3', '4', '5', '6'], () => ({ creatures: [''] })) } as Record<string, Record<string, { creatures: string[] }>>,
      creatures: { '': { level: null, hp: null, xp: null, shift: null, treasure: '' } } as Record<string, { level: number | null; hp: number | null; xp: number | null; shift: number | null; treasure: string }>,
      referenceTables: {
        XX1: { name: '', group: '', page: null as number | null, dice: null as string | null, columns: [''], rows: [{ cells: [''] }] },
      } as Record<string, { name: string; group: string; page: number | null; dice: string | null; columns: string[]; rows: { roll?: string; cells: string[] }[] }>,
    },
  };
}
