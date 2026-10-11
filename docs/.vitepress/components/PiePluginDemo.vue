<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import authoringSource from '../../../src/charts/pie/authoring.ts?raw';
import moduleSource from '../../../src/charts/pie/module.ts?raw';
import pluginSource from '../../../src/charts/pie/plugin.ts?raw';
import geometrySource from '../../../src/charts/pie/geometry.ts?raw';
import renderSource from '../../../src/charts/pie/render.ts?raw';
const sources = [
  { name: 'authoring.ts', code: authoringSource },
  { name: 'module.ts', code: moduleSource },
  { name: 'plugin.ts', code: pluginSource },
  { name: 'geometry.ts', code: geometrySource },
  { name: 'render.ts', code: renderSource }
];

const rows = [
  { id: 'A', before: 100, after: 625 },
  { id: 'B', before: 400, after: 144 },
  { id: 'C', before: 225, after: 484 },
  { id: 'D', before: 625, after: 100 }
];
const code = `import { pie } from "visdelta/pie";
import { transition } from "visdelta/transition";

const from = pie(rows).key("id").label("id").color("id").value("before");
const to = from.value("after");
const change = await transition(from, to, { target: "#pie" });

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
    const [{ pie }, { transition }] = await Promise.all([
      import('../../../dist/pie.js'),
      import('../../../dist/transition-entry.js')
    ]);
    if (disposed) return;
    const from = pie(rows).key('id').label('id').color('id').value('before');
    const candidate = await transition(from, from.value('after'), { target: target.value, height: 300 });
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
  <section class="pie-demo" aria-label="Live Pie plugin demo">
    <p>Four source records, four keyed slices. Switching the value field changes each share of the total; slice identity stays the same.</p>
    <table aria-label="Pie sample data">
      <thead><tr><th>id</th><th>before</th><th>after</th></tr></thead>
      <tbody><tr v-for="row in rows" :key="row.id"><td>{{ row.id }}</td><td>{{ row.before }}</td><td>{{ row.after }}</td></tr></tbody>
    </table>
    <DocsCodeBlock :code="code" language="js" />
    <div ref="target" class="pie-demo-chart" aria-label="Pie chart"></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!ready" role="status">Loading Pie…</p>
    <div class="pie-demo-controls">
      <button type="button" :disabled="!ready" @click="play(false)">Play</button>
      <button type="button" :disabled="!ready" @click="play(true)">Reverse</button>
      <button type="button" :disabled="!playing" @click="pause">Pause</button>
      <label>Progress
        <input type="range" min="0" max="1" step="0.01" :value="progress" :disabled="!ready" aria-label="Pie progress" @input="seek" />
      </label>
      <output>{{ Math.round(progress * 100) }}%</output>
    </div>
    <details v-for="source in sources" :key="source.name" class="pie-demo-source">
      <summary>View Pie {{ source.name }}</summary>
      <DocsCodeBlock :code="source.code" language="ts" />
    </details>
  </section>
</template>

<style scoped>
.pie-demo { margin: 24px 0; min-width: 0; }
.pie-demo-chart { min-height: 300px; }
.pie-demo-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.pie-demo-controls button { border: 1px solid var(--vp-c-divider); border-radius: 4px; padding: 5px 12px; font: inherit; }
.pie-demo-controls button:hover:not(:disabled) { background: var(--vp-c-bg-soft); }
.pie-demo-controls button:disabled { opacity: 0.45; }
.pie-demo-controls label { display: flex; align-items: center; gap: 8px; flex: 1 1 180px; }
.pie-demo-controls input { width: 100%; min-width: 70px; accent-color: #3366ff; }
.pie-demo-controls output { min-width: 4ch; font-variant-numeric: tabular-nums; }
.pie-demo-source { margin-top: 20px; }
.pie-demo-source summary { cursor: pointer; }
</style>
