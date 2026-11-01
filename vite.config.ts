import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { pwaPlugin } from './scripts/pwaPlugin';

// BUILD_ID can be set to force a known id (the PWA e2e does); otherwise each build gets a fresh one.
const buildId = process.env.BUILD_ID ?? Date.now().toString(36);

export default defineConfig({
  base: './',
  plugins: [svelte(), pwaPlugin()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
});
