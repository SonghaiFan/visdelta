<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import pluginSource from '../../../examples/plugins/orbit/index.js?raw';

const rows = [
  { id: 'A', before: 100, after: 625 },
  { id: 'B', before: 400, after: 144 },
  { id: 'C', before: 225, after: 484 },
  { id: 'D', before: 625, after: 100 }
];
const code = `import { orbit } from "./orbit/index.js";
import { transition } from "visdelta/transition";

const from = orbit(rows).size("before");
const to = from.size("after");
const change = await transition(from, to, { target: "#orbit" });

change.play(); // Or: change.progress(0.5)`;
const target = ref(null);
const ready = ref(false);
const progress = ref(0);
const playing = ref(false);
const error = ref('');
let change;
let observer;
let frame;
let disposed = false;

onMounted(async () => {
  try {
    const [{ orbit }, { transition }] = await Promise.all([
      import('../../../examples/plugins/orbit/index.js'),
      import('../../../dist/transition-entry.js')
    ]);
    if (disposed) return;
    const from = orbit(rows).size('before');
    const candidate = await transition(from, from.size('after'), { target: target.value, height: 300 });
    if (disposed) { candidate.destroy(); return; }
    change = candidate;
    ready.value = true;
    let width = target.value.clientWidth;
    observer = new ResizeObserver(() => {
      const nextWidth = target.value?.clientWidth;
      if (nextWidth && nextWidth !== width) { width = nextWidth; change.resize(); }
    });
    observer.observe(target.value);
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause);
  }
});

function pause() {
  cancelAnimationFrame(frame);
  change?.pause();
  if (change) progress.value = change.value;
  playing.value = false;
}
function play(reverse = false) {
  if (!change) return;
  pause();
  const end = reverse ? 0 : 1;
  const start = change.value === end ? 1 - end : change.value;
  change.play({ from: start, to: end, duration: 1400 });
  progress.value = start;
  playing.value = true;
  function sync() {
    progress.value = change.value;
    if (change.value === end) playing.value = false;
    else frame = requestAnimationFrame(sync);
  }
  frame = requestAnimationFrame(sync);
}
function seek(event) {
  pause();
  progress.value = event.target.valueAsNumber;
  change?.progress(progress.value);
}
onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(frame);
  observer?.disconnect();
  change?.destroy();
});
</script>

<template>
  <section class="orbit-demo" aria-label="Live Orbit plugin demo">
    <p>Four source records, four circles. Circle area follows the selected size field; identity and ring positions stay the same.</p>
    <table aria-label="Orbit sample data">
      <thead><tr><th>id</th><th>before</th><th>after</th></tr></thead>
      <tbody><tr v-for="row in rows" :key="row.id"><td>{{ row.id }}</td><td>{{ row.before }}</td><td>{{ row.after }}</td></tr></tbody>
    </table>
    <DocsCodeBlock :code="code" language="js" />
    <div ref="target" class="orbit-demo-chart" aria-label="Orbit chart"></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!ready" role="status">Loading Orbit…</p>
    <div class="orbit-demo-controls">
      <button type="button" :disabled="!ready" @click="play(false)">Play</button>
      <button type="button" :disabled="!ready" @click="play(true)">Reverse</button>
      <button type="button" :disabled="!playing" @click="pause">Pause</button>
      <label>Progress
        <input type="range" min="0" max="1" step="0.01" :value="progress" :disabled="!ready" aria-label="Orbit progress" @input="seek" />
      </label>
      <output>{{ Math.round(progress * 100) }}%</output>
    </div>
    <details class="orbit-demo-source">
      <summary>View Orbit plugin source</summary>
      <DocsCodeBlock :code="pluginSource" language="js" />
    </details>
  </section>
</template>

<style scoped>
.orbit-demo { margin: 24px 0; min-width: 0; }
.orbit-demo-chart { min-height: 300px; }
.orbit-demo-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.orbit-demo-controls button { border: 1px solid var(--vp-c-divider); border-radius: 4px; padding: 5px 12px; font: inherit; }
.orbit-demo-controls button:hover:not(:disabled) { background: var(--vp-c-bg-soft); }
.orbit-demo-controls button:disabled { opacity: 0.45; }
.orbit-demo-controls label { display: flex; align-items: center; gap: 8px; flex: 1 1 180px; }
.orbit-demo-controls input { width: 100%; min-width: 70px; accent-color: #3366ff; }
.orbit-demo-controls output { min-width: 4ch; font-variant-numeric: tabular-nums; }
.orbit-demo-source { margin-top: 20px; }
.orbit-demo-source summary { cursor: pointer; }
</style>
