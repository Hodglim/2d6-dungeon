import { mount } from 'svelte';
import App from './App.svelte';
import { buildId, registerServiceWorker } from './pwa/register';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

export default mount(App, { target });

document.documentElement.dataset.build = buildId();
// Dev (npm run dev) never registers a worker: it would cache stale modules.
if (import.meta.env.PROD) registerServiceWorker();
