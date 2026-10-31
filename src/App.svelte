<script lang="ts">
  import { onMount } from 'svelte';
  import { demoMap } from './app/demo';
  import { findPath } from './core/pathfinding';
  import { moveToken } from './core/token';
  import type { DungeonMap } from './core/types';
  import { panBy, zoomAt } from './render/camera';
  import { DEFAULT_TOGGLES, type DisplayToggles, MapRenderer } from './render/renderer';
  import { classicTheme } from './systems/dungeon/classic';

  let canvas: HTMLCanvasElement;
  let renderer = $state.raw<MapRenderer | null>(null);
  let map: DungeonMap = demoMap();
  let toggles: DisplayToggles = $state({ ...DEFAULT_TOGGLES });
  let drag: { x: number; y: number } | null = null;

  const toggleNames = Object.keys(DEFAULT_TOGGLES) as (keyof DisplayToggles)[];

  onMount(() => {
    const r = new MapRenderer(canvas, classicTheme);
    renderer = r;
    r.setMap(map);
    const size = () => {
      r.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    };
    size();
    r.fit();
    r.start();
    const onResize = () => size();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      r.stop();
    };
  });

  $effect(() => {
    renderer?.setToggles({ ...toggles });
  });

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    renderer.setCamera(zoomAt(renderer.camera, Math.exp(-e.deltaY * 0.0015), { x: e.clientX - rect.left, y: e.clientY - rect.top }));
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !e.isPrimary) return;
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!e.isPrimary || !drag || !renderer) return;
    renderer.setCamera(panBy(renderer.camera, e.clientX - drag.x, e.clientY - drag.y));
    drag = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e: PointerEvent) {
    if (!e.isPrimary) return;
    drag = null;
  }

  /** Walk the token to a random reachable floor square. */
  function wander() {
    const token = map.token;
    if (!renderer || renderer.walking || !token) return;
    const floor = map.rooms.flatMap((room) =>
      Array.from({ length: room.w * room.h }, (_, i) => ({ x: room.x + (i % room.w), y: room.y + Math.floor(i / room.w) })),
    );
    for (let tries = 0; tries < 20; tries++) {
      const target = floor[Math.floor(Math.random() * floor.length)]!;
      const path = findPath(map, token, target);
      const cmd = path && moveToken(map, path);
      if (!path || !cmd) continue;
      renderer.walkToken(path, () => {
        map = cmd.apply(map);
        renderer?.setMap(map);
      });
      return;
    }
  }
</script>

<main>
  <canvas
    bind:this={canvas}
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  ></canvas>
  <div class="panel">
    <button onclick={() => renderer?.fit()}>Fit</button>
    <button onclick={wander}>Walk token</button>
    {#each toggleNames as name (name)}
      <label><input type="checkbox" bind:checked={toggles[name]} /> {name}</label>
    {/each}
  </div>
</main>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    font-family: system-ui, sans-serif;
  }
  main {
    position: fixed;
    inset: 0;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  .panel {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    background: rgba(255, 255, 255, 0.9);
    padding: 6px 10px;
    border-radius: 6px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    font-size: 14px;
  }
  button {
    min-height: 32px;
  }
</style>
