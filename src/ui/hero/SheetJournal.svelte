<script lang="ts">
  import type { Hero, ListKey } from '../../systems/dungeon/hero';
  import { adjustCoin, removeItem, type Coin, type StringList } from './heroActions';
  import StringListEditor from './StringListEditor.svelte';

  /** What the hero has won and what is going on: coins, treasure, loot lockup, story threads and notes. */
  interface Props {
    hero: Hero;
    onedit: (next: Hero, opts?: { label?: string; mergeKey?: string; limit?: ListKey }) => void;
    ontext: (field: 'narrative' | 'notes', from: Hero, value: string) => void;
  }
  let { hero, onedit, ontext }: Props = $props();

  const coins: { key: Coin; label: string }[] = [
    { key: 'gc', label: 'GC' },
    { key: 'sc', label: 'SC' },
    { key: 'cc', label: 'CC' },
  ];
  function setCoin(e: Event, coin: Coin) {
    const el = e.currentTarget as HTMLInputElement;
    const n = Number(el.value.trim());
    if (el.value.trim() === '' || !Number.isInteger(n) || n < 0) {
      el.value = String(hero.coins[coin]);
      return;
    }
    if (n !== hero.coins[coin]) onedit(adjustCoin(hero, coin, n - hero.coins[coin]));
  }
  const addTo = (key: StringList) => (text: string) => onedit({ ...hero, [key]: [...hero[key], text.trim()] });
  const removeFrom = (key: StringList) => (i: number) => onedit(removeItem(hero, key, i));

  // Typed text: each box remembers the hero it was typed against; teardown never reads the (possibly null) prop.
  let narrativeBox: HTMLTextAreaElement | undefined;
  let notesBox: HTMLTextAreaElement | undefined;
  const typedFrom: Record<'narrative' | 'notes', Hero | null> = { narrative: null, notes: null };
  function commit(field: 'narrative' | 'notes') {
    const from = typedFrom[field];
    typedFrom[field] = null;
    const box = field === 'narrative' ? narrativeBox : notesBox;
    if (from && box && box.value !== from[field]) ontext(field, from, box.value);
  }
  // Tapping a button on iPad Safari may not blur the box: keep the text when the page goes away.
  $effect(() => () => {
    commit('narrative');
    commit('notes');
  });
</script>

<div class="page">
  <section>
    <h3>Coins</h3>
    <div class="row">
      {#each coins as k (k.key)}
        <label>
          <span class="cap">{k.label}</span>
          <input class="num" type="text" inputmode="numeric" aria-label="{k.label} (sheet)" value={hero.coins[k.key]} onchange={(e) => setCoin(e, k.key)} />
        </label>
      {/each}
    </div>
  </section>

  <StringListEditor title="Treasure" items={hero.treasure} placeholder="Treasure" onadd={addTo('treasure')} onremove={removeFrom('treasure')} />
  <StringListEditor title="Loot lockup" items={hero.lootLockup} placeholder="Stored loot" onadd={addTo('lootLockup')} onremove={removeFrom('lootLockup')} />
  <StringListEditor title="Side quests" items={hero.sideQuests} placeholder="Side quest" onadd={addTo('sideQuests')} onremove={removeFrom('sideQuests')} />
  <StringListEditor title="Prisoners" items={hero.prisoners} placeholder="Prisoner" onadd={addTo('prisoners')} onremove={removeFrom('prisoners')} />

  <section>
    <h3>Narrative</h3>
    <textarea bind:this={narrativeBox} aria-label="Narrative" rows="10" value={hero.narrative} oninput={() => (typedFrom.narrative ??= hero)} onchange={() => commit('narrative')}></textarea>
  </section>

  <section>
    <h3>Additional notes</h3>
    <textarea bind:this={notesBox} aria-label="Additional notes" rows="6" value={hero.notes} oninput={() => (typedFrom.notes ??= hero)} onchange={() => commit('notes')}></textarea>
  </section>
</div>
