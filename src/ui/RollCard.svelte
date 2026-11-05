<script lang="ts">
  // A panel's roll, shown as a card: what it is for and a button that hands it to the dice roller.
  // It registers its job on the desk while it is on screen; when done, `children` replace the card.
  import { onDestroy, type Snippet } from 'svelte';
  import { rollLabel } from './diceRoller';
  import type { DeskView, DiceJob } from './diceDesk';
  import { useDiceDesk } from './diceDeskContext';

  interface Props {
    job: DiceJob;
    done?: boolean;
    children?: Snippet;
  }
  let { job, done = false, children }: Props = $props();

  const desk = useDiceDesk();
  let view = $state.raw<DeskView | null>(desk ? desk.view : null);
  $effect(() => desk?.subscribe((v) => (view = v)));

  let putId: string | null = null;
  $effect(() => {
    if (!desk) return;
    // Register the new id before dropping the old one, so a target that moves with it falls onto the new
    // job (the newest request, or a standing one when nothing else asks) rather than onto some other card.
    const old = putId;
    putId = job.id;
    desk.put(job);
    if (old !== null && old !== job.id) desk.remove(old);
  });
  // Removed on destroy only: a re-put (new job object) must not drop the target.
  onDestroy(() => {
    if (putId !== null) desk?.remove(putId);
  });

  const aimed = $derived(view?.target?.id === job.id);
</script>

<div class="roll-card" data-testid="roll-card">
  {#if done}
    {@render children?.()}
  {:else}
    <span class="what">{job.label} · {rollLabel(job.dice, job.modifier ?? 0)}</span>
    {#if desk}
      <button type="button" onclick={() => desk.rollNow(job.id)}>{view?.enterMode ? '🎲 Enter in roller' : '🎲 Roll'}</button>
    {/if}
    {#if aimed}<span class="hint">In the dice roller</span>{/if}
    {#if job.error}<p class="error" role="alert">{job.error}</p>{/if}
  {/if}
</div>

<style>
  .roll-card {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .what {
    font-weight: 600;
  }
  button {
    min-width: 44px;
    min-height: 44px;
    padding: 0 12px;
    font: inherit;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .hint {
    color: var(--muted);
    font-size: 14px;
  }
  .error {
    flex-basis: 100%;
    margin: 0;
    color: var(--danger);
    font-size: 14px;
  }
</style>
