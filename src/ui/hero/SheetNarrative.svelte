<script lang="ts">
  import type { Hero } from '../../systems/dungeon/hero';

  interface Props {
    hero: Hero;
    onedit: (next: Hero) => void;
  }
  let { hero, onedit }: Props = $props();

  let area: HTMLTextAreaElement | undefined;

  function commit() {
    if (area && area.value !== hero.narrative) onedit({ ...hero, narrative: area.value });
  }

  // Tapping a button on iPad Safari may not blur the box: keep the text when the page goes away.
  $effect(() => () => commit());
</script>

<div class="page">
  <section>
    <h3>Narrative</h3>
    <textarea bind:this={area} aria-label="Narrative" rows="14" value={hero.narrative} onchange={commit}></textarea>
  </section>
</div>
