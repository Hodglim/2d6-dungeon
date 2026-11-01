<script lang="ts">
  interface Props {
    title: string;
    items: string[];
    placeholder: string;
    onadd: (text: string) => void;
    onremove: (index: number) => void;
  }
  let { title, items, placeholder, onadd, onremove }: Props = $props();
  let text = $state('');

  function add() {
    if (!text.trim()) return;
    onadd(text);
    text = '';
  }
</script>

<section class="list">
  <h3>{title}</h3>
  {#if items.length}
    <ul>
      {#each items as item, i (i)}
        <li>
          <span class="grow">{item}</span>
          <button aria-label="Remove {item}" onclick={() => onremove(i)}>Remove</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">None</p>
  {/if}
  <form class="row" onsubmit={(e) => { e.preventDefault(); add(); }}>
    <input type="text" bind:value={text} {placeholder} aria-label="{title}: new entry" />
    <button type="submit" disabled={!text.trim()}>Add</button>
  </form>
</section>
