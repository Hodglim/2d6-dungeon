import { describe, expect, it } from 'vitest';
import { choiceOf, doorChoices, doorFromChoice, SECRET_CHOICE } from '../../src/ui/doorChoice';

const types = [
  { id: 'archway', name: 'Archway' },
  { id: 'wooden', name: 'Wooden door' },
];

describe('door choices', () => {
  it('lists every door type with Secret door last', () => {
    expect(doorChoices(types)).toEqual([...types, { id: SECRET_CHOICE, name: 'Secret door' }]);
  });
  it('a secret door is always a wooden door marked secret', () => {
    expect(doorFromChoice(SECRET_CHOICE)).toEqual({ type: 'wooden', secret: true });
  });
  it('any other choice is that type, not secret', () => {
    expect(doorFromChoice('archway')).toEqual({ type: 'archway', secret: false });
  });
  it('a door marked secret shows as the Secret door choice whatever its type', () => {
    expect(choiceOf({ type: 'wooden', secret: true })).toBe(SECRET_CHOICE);
    expect(choiceOf({ type: 'metal', secret: true })).toBe(SECRET_CHOICE);
    expect(choiceOf({ type: 'metal', secret: false })).toBe('metal');
  });
});
