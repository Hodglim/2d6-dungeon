<script lang="ts">
  import type { Hero } from '../../systems/dungeon/hero';

  interface Props {
    hero: Hero;
    onedit: (next: Hero, opts?: { from?: Hero }) => void;
  }
  let { hero, onedit }: Props = $props();

  let area: HTMLTextAreaElement | undefined;
  /** The hero the text is being typed against; the teardown commit never reads the (possibly null) prop. */
  let typedFrom: Hero | null = null;

  function commit() {
    const from = typedFrom;
    typedFrom = null;
    if (from && area && area.value !== from.narrative) onedit({ ...from, narrative: area.value }, { from });
  }

  // Tapping a button on iPad Safari may not blur the box: keep the text when the page goes away.
  $effect(() => () => commit());
</script>

<div class="page">
  <section>
    <h3>Narrative</h3>
    <textarea bind:this={area} aria-label="Narrative" rows="14" value={hero.narrative} oninput={() => (typedFrom ??= hero)} onchange={commit}></textarea>
  </section>
</div>
