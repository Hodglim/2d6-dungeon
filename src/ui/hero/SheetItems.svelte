<script lang="ts">
  import type { Hero, ListKey } from '../../systems/dungeon/hero';
  import { overLimit } from '../../systems/dungeon/hero';
  import { addItem, removeItem } from './heroActions';
  import StringListEditor from './StringListEditor.svelte';

  interface Props {
    hero: Hero;
    onedit: (next: Hero, opts?: { label?: string; mergeKey?: string; limit?: ListKey; from?: Hero }) => void;
  }
  let { hero, onedit }: Props = $props();

  const slots = $derived(Math.max(hero.rules.limits.largeItems, hero.largeItems.length));
  let slotText = $state('');

  function addLarge() {
    if (!slotText.trim()) return;
    onedit(addItem(hero, 'large', slotText), { limit: 'largeItems' });
    slotText = '';
  }
  function setRations(n: number) {
    if (n >= 0) onedit({ ...hero, rations: n });
  }
  let notesBox: HTMLTextAreaElement | undefined;
  /** The hero the notes are being typed against; teardown never reads the (possibly null) prop. */
  let typedFrom: Hero | null = null;
  function setNotes() {
    const from = typedFrom;
    typedFrom = null;
    if (from && notesBox && notesBox.value !== from.notes) onedit({ ...from, notes: notesBox.value }, { from });
  }
  function setRationsNote(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (v !== hero.rationsNote) onedit({ ...hero, rationsNote: v });
  }
  // Tapping a button on iPad Safari may not blur the box: keep the text when the page goes away.
  $effect(() => () => setNotes());
</script>

<div class="page">
  <section>
    <h3 class:over={overLimit(hero, 'largeItems')}>Large and heavy items {hero.largeItems.length} / {hero.rules.limits.largeItems}</h3>
    <ol class="slots">
      {#each { length: slots } as _, i (i)}
        <li class:over={i >= hero.rules.limits.largeItems}>
          <span class="n">{i + 1}</span>
          {#if hero.largeItems[i] !== undefined}
            <span class="grow">{hero.largeItems[i]}</span>
            <button aria-label="Remove {hero.largeItems[i]}" onclick={() => onedit(removeItem(hero, 'largeItems', i))}>Remove</button>
          {:else}
            <span class="grow empty">empty</span>
          {/if}
        </li>
      {/each}
    </ol>
    <form class="row" onsubmit={(e) => { e.preventDefault(); addLarge(); }}>
      <input type="text" class="grow" placeholder="Large item" aria-label="New large item" bind:value={slotText} />
      <button type="submit" disabled={!slotText.trim()}>Add</button>
    </form>
  </section>

  <StringListEditor
    title="Small items"
    items={hero.smallItems}
    placeholder="Small item"
    onadd={(t) => onedit(addItem(hero, 'small', t))}
    onremove={(i) => onedit(removeItem(hero, 'smallItems', i))}
  />
  <StringListEditor
    title="Loot lockup"
    items={hero.lootLockup}
    placeholder="Stored loot"
    onadd={(t) => onedit({ ...hero, lootLockup: [...hero.lootLockup, t.trim()] })}
    onremove={(i) => onedit(removeItem(hero, 'lootLockup', i))}
  />

  <section>
    <h3>Rations</h3>
    <div class="row">
      <button aria-label="Rations down" disabled={hero.rations === 0} onclick={() => setRations(hero.rations - 1)}>−</button>
      <strong class="total">{hero.rations}</strong>
      <button aria-label="Rations up" onclick={() => setRations(hero.rations + 1)}>+</button>
      <input type="text" class="grow" aria-label="Rations note" placeholder="Note" value={hero.rationsNote} onchange={setRationsNote} />
    </div>
  </section>

  <section>
    <h3>Additional notes</h3>
    <textarea bind:this={notesBox} aria-label="Additional notes" rows="6" value={hero.notes} oninput={() => (typedFrom ??= hero)} onchange={setNotes}></textarea>
  </section>
</div>
