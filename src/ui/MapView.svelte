<script lang="ts">
  import { onMount } from 'svelte';
  import type { DungeonMap } from '../core/types';
  import { type Camera, clampCamera, panBy, pinchCamera, type Point, wheelFactor, worldBounds, zoomAt } from '../render/camera';
  import { type Pick, pick } from '../render/hit';
  import { type DisplayToggles, MapRenderer } from '../render/renderer';
  import { classicTheme } from '../systems/dungeon/classic';

  interface Props {
    map: DungeonMap;
    toggles: DisplayToggles;
    /** A tap: what's under it, plus the exact world point (squares) for nearest-edge snapping. */
    ontap?: (pick: Pick, world: Point) => void;
    /** The pointer is over the map (mouse, no button) or dragging the ghost (see `dragsGhost`). */
    onhover?: (world: Point) => void;
    /** When true, a one-pointer drag reports `onhover` instead of panning the camera. */
    dragsGhost?: boolean;
    /** The draft room's rect, exposed as `data-ghost` for scripts/visual.mjs. */
    ghost?: { x: number; y: number; w: number; h: number } | null;
  }

  let { map, toggles, ontap, onhover, dragsGhost = false, ghost = null }: Props = $props();

  /** A primary pointer that moves less than this (CSS px) before lifting is a tap. */
  const TAP_SLOP = 8;

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let renderer = $state.raw<MapRenderer | null>(null);
  let viewW = 0;
  let viewH = 0;
  let dpr = 1;
  /** Id of the map the camera was last fitted to; a different map (new map, demo) re-fits. */
  let fittedMapId: string | null = null;

  /** Active pointers by pointerId, in canvas-local CSS px. At most two are tracked. */
  const pointers = new Map<number, Point>();
  /** The gesture in progress: a possible tap (until it moves past TAP_SLOP), a pan, or a pinch. */
  let gesture: { start: Point; moved: boolean; tap: boolean; ignore: boolean } | null = null;

  /** The renderer, for later overlay / token-walk wiring. */
  export function getRenderer(): MapRenderer | null {
    return renderer;
  }

  export function fit(): void {
    if (!renderer || viewW <= 0 || viewH <= 0) return;
    renderer.fit();
    setCamera(renderer.camera);
    fittedMapId = map.id;
  }

  /** Every camera change goes through clampCamera so the map can't be lost. */
  function setCamera(cam: Camera): void {
    if (!renderer) return;
    renderer.setCamera(viewW > 0 && viewH > 0 ? clampCamera(cam, worldBounds(map), viewW, viewH) : cam);
    // Exposed for scripts/visual.mjs, which taps squares by world position.
    const c = renderer.camera;
    canvas.dataset.camera = `${c.x},${c.y},${c.scale}`;
  }

  function local(e: { clientX: number; clientY: number }): Point {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function sizeTo(w: number, h: number): void {
    if (!renderer) return;
    viewW = w;
    viewH = h;
    renderer.resize(w, h, dpr);
    if (w <= 0 || h <= 0) return;
    if (fittedMapId !== map.id) fit();
    else setCamera(renderer.camera);
  }

  onMount(() => {
    const r = new MapRenderer(canvas, classicTheme);
    renderer = r;
    r.setMap(map);
    r.setToggles({ ...toggles });
    dpr = window.devicePixelRatio || 1;

    const ro = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (box) sizeTo(box.width, box.height);
    });
    ro.observe(host);

    // A dpr change (zoom, moving to another screen) doesn't resize the element, so watch it.
    let mq: MediaQueryList | null = null;
    const onDpr = () => {
      dpr = window.devicePixelRatio || 1;
      sizeTo(viewW, viewH);
      watchDpr();
    };
    const watchDpr = () => {
      mq?.removeEventListener('change', onDpr);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener('change', onDpr);
    };
    watchDpr();

    // Registered by hand: wheel must be non-passive to stop the page zooming/scrolling.
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const rect = host.getBoundingClientRect();
    sizeTo(rect.width, rect.height);
    r.start();
    return () => {
      ro.disconnect();
      mq?.removeEventListener('change', onDpr);
      canvas.removeEventListener('wheel', onWheel);
      r.stop();
    };
  });

  $effect(() => {
    const m = map;
    if (!renderer) return;
    renderer.setMap(m);
    if (fittedMapId !== m.id) fit();
  });

  $effect(() => {
    renderer?.setToggles({ ...toggles });
  });

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!renderer) return;
    setCamera(zoomAt(renderer.camera, wheelFactor(e.deltaY, e.deltaMode), local(e)));
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointers.size >= 2) return;
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) gesture = { start: p, moved: false, tap: true, ignore: false };
    else if (gesture) gesture.tap = false; // a second finger makes it a pinch, never a tap
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse' && e.buttons === 0 && renderer && onhover) {
        onhover(renderer.screenToWorldPoint(e.clientX, e.clientY));
      }
      return;
    }
    if (!renderer || !gesture) return;
    const p = local(e);
    if (pointers.size === 1) {
      if (gesture.ignore) {
        pointers.set(e.pointerId, p); // the finger left over from a pinch does nothing until it lifts
        return;
      }
      if (!gesture.moved && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) >= TAP_SLOP) {
        gesture.moved = true;
        gesture.tap = false;
      }
      if (gesture.moved && dragsGhost && onhover) onhover(renderer.screenToWorldPoint(e.clientX, e.clientY));
      else if (gesture.moved) setCamera(panBy(renderer.camera, p.x - prev.x, p.y - prev.y));
      pointers.set(e.pointerId, p);
      return;
    }
    const [a, b] = [...pointers.entries()];
    if (!a || !b) return;
    const before: [Point, Point] = [a[1], b[1]];
    pointers.set(e.pointerId, p);
    const after: [Point, Point] = [pointers.get(a[0])!, pointers.get(b[0])!];
    setCamera(pinchCamera(renderer.camera, before, after));
  }

  function onPointerUp(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const wasTap = e.type === 'pointerup' && pointers.size === 1 && gesture?.tap === true;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) gesture = null;
    else if (gesture) {
      gesture.moved = true; // the remaining finger keeps panning, no jump
      gesture.ignore = dragsGhost; // but while the ghost is dragged it must not make the ghost jump
    }
    if (wasTap && renderer && ontap) {
      const world = renderer.screenToWorldPoint(e.clientX, e.clientY);
      ontap(pick(map, world), world);
    }
  }
</script>

<div class="map-view" bind:this={host}>
  <canvas
    bind:this={canvas}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    data-ghost={ghost ? `${ghost.x},${ghost.y},${ghost.w},${ghost.h}` : undefined}
    aria-label="Map"
  ></canvas>
</div>

<style>
  .map-view {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
</style>
