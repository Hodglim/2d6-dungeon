<script lang="ts">
  // The Stairs tool's panel: stairs are added (down) on a floor tap; here they're turned
  // up or down, or removed.
  import { type Command, removeFeature, updateFeature } from '../../core/commands';
  import type { DungeonMap, Feature } from '../../core/types';
  import type { Selection } from '../tapRouting';

  interface Props {
    map: DungeonMap;
    featureId: string;
    onexec: (cmd: Command | null) => boolean;
    onselect: (s: Selection | null) => void;
  }

  let { map, featureId, onexec, onselect }: Props = $props();

  type Stairs = Extract<Feature, { kind: 'stairs' }>;
  const stairs = $derived(map.features.find((f): f is Stairs => f.id === featureId && f.kind === 'stairs'));

  function setDir(s: Stairs, dir: Stairs['dir']) {
    if (s.dir !== dir) onexec(updateFeature(s, { ...s, dir }));
  }

  function remove(s: Stairs) {
    if (onexec(removeFeature(s))) onselect(null);
  }
</script>

{#if stairs}
  <div class="editor" data-editor="stairs">
    <h3>Stairs {stairs.dir}</h3>
    <div class="row" role="group" aria-label="Stairs direction">
      <button aria-pressed={stairs.dir === 'down'} onclick={() => setDir(stairs, 'down')}>Down</button>
      <button aria-pressed={stairs.dir === 'up'} onclick={() => setDir(stairs, 'up')}>Up</button>
    </div>
    <div class="row">
      <button class="danger" onclick={() => remove(stairs)}>Remove stairs</button>
    </div>
  </div>
{/if}

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
  }
  h3 {
    margin: 0;
    font-size: 20px;
  }
  .danger {
    color: var(--danger) !important;
    border-color: var(--danger) !important;
  }
</style>
