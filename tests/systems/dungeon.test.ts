import { dungeonSystem } from '../../src/systems/dungeon';

describe('dungeonSystem', () => {
  it('default door type is one of its door types', () => {
    expect(dungeonSystem.doorTypes.map((d) => d.id)).toContain(dungeonSystem.defaultDoorType);
  });
  it('rolls each room dimension on one d6 and allows up to 3 exits', () => {
    expect(dungeonSystem.roomDieRange).toEqual({ min: 1, max: 6 });
    expect(dungeonSystem.maxExits).toBe(3);
  });
});
