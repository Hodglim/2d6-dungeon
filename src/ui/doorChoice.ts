// The Door tool's door-type list: the game's door types, then "Secret door". A secret door is
// stored as a wooden door with `secret` set (secret doors are always wooden), so saved maps
// keep their shape and pathfinding keeps reading `secret`.

export const SECRET_CHOICE = 'secret';

export interface DoorChoice {
  id: string;
  name: string;
}

export function doorChoices(types: readonly DoorChoice[]): DoorChoice[] {
  return [...types, { id: SECRET_CHOICE, name: 'Secret door' }];
}

export function doorFromChoice(choice: string): { type: string; secret: boolean } {
  return choice === SECRET_CHOICE ? { type: 'wooden', secret: true } : { type: choice, secret: false };
}

export function choiceOf(door: { type: string; secret: boolean }): string {
  return door.secret ? SECRET_CHOICE : door.type;
}
