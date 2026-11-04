import type { GameSystem } from '../../core/system';
import { encounterProblem } from './combat';
import { heroProblem } from './hero';

export const dungeonSystem: GameSystem = {
  id: 'dungeon',
  name: '2D6 Dungeon',
  doorTypes: [
    { id: 'archway', name: 'Archway' },
    { id: 'wooden', name: 'Wooden door' },
    { id: 'metal', name: 'Metal door' },
    { id: 'reinforced', name: 'Reinforced door' },
    { id: 'curtain', name: 'Curtain' },
    { id: 'portcullis', name: 'Portcullis' },
    { id: 'stoneSlab', name: 'Stone slab' },
  ],
  defaultDoorType: 'archway',
  defaultThemeId: 'classic',
  entranceEdge: 'S',
  defaultMapSize: { width: 25, height: 25 },
  roomDieRange: { min: 1, max: 6 },
  maxExits: 3,
  heroProblem,
  encounterProblem,
};
