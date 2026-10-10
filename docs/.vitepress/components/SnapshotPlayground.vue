<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import * as d3 from 'd3';
import PlaygroundDataPicker from './PlaygroundDataPicker.vue';
import EditableCodeCell from './EditableCodeCell.vue';
import StateChangeIcon from './StateChangeIcon.vue';

const props = defineProps({ mode: String, initial: String, hashPrefix: String });
const modules = import.meta.glob('../../../examples/*/scenarios.js', { eager: true });
const lab = Object.values(modules).find(module => `${module.chart}-lab` === props.mode);
const categories = ['data', 'grain', 'encoding', 'coordinate', 'layout', 'attention', 'appearance'];
const selected = ref(lab.scenarios.find(s => s.id === props.initial)?.id ?? lab.scenarios[0].id);
const sample = computed(() => lab.scenarios.find(s => s.id === selected.value));
const category = ref(sample.value.category);
const frames = shallowRef([]);
const activeId = ref(null);
const code = ref('');
const status = ref('Loading runtime');
const error = ref('');
const tableRows = ref([]);
const datasetName = ref('Demo dataset');
const columns = computed(() => [...new Set(tableRows.value.flatMap(Object.keys))]);
const target = ref(null);
const progress = ref(1);
const deltaText = ref('{}');
const playing = ref(false);
const active = computed(() => frames.value.find(f => f.id === activeId.value));
let api, factory, controller, observer, timer, raf;
let version = 0;
let nextId = 0;
let sourceRows = [];
let disposed = false;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const candidates = new Set();

function cancel() {
  clearTimeout(timer);
  cancelAnimationFrame(raf);
  controller?.pause();
  playing.value = false;
  return ++version;
}
function fail(cause, request) {
  if (request !== version || disposed) return;
  error.value = `${cause instanceof Error ? cause.message : cause}\nShowing the last saved frame.`;
  status.value = 'Error';
}
async function evaluate(source, rows) {
  const state = await new AsyncFunction(lab.chart, 'd3', 'rows', `"use strict";\n${source}\nreturn chart;`)(factory, d3, structuredClone(rows));
  if (typeof state?.toSpec !== 'function' || typeof state?.rows !== 'function') throw new Error('Assign a VisDelta state to const chart.');
  if (state.toSpec().mark !== lab.chart) throw new Error(`Use the ${lab.chart} chart type selected above.`);
  return state;
}
async function makeFrame(source, label, rows, request, name = datasetName.value, description = active.value?.description ?? sample.value.description) {
  const state = await evaluate(source, rows);
  const spec = state.toSpec();
  let data = Array.isArray(spec.data) ? spec.data : spec.data?.values;
  if (!data && spec.data?.url) data = /\.json(?:[?#]|$)/i.test(spec.data.url) ? await d3.json(spec.data.url) : await d3.csv(spec.data.url, d3.autoType);
  const materialized = state.rows(data);
  // Freeze URL-backed data as part of the snapshot too, while retaining its plugin.
  const frozen = structuredClone(spec);
  frozen.data = { values: structuredClone(data ?? []) };
  const saved = { toSpec: () => structuredClone(frozen), chartModule: () => state.chartModule() };
  const host = document.createElement('div');
  host.className = 'snapshot-render-target';
  target.value.append(host);
  candidates.add(host);
  let preview;
  try {
    preview = await api.transition(saved, saved, { target: host, height: 240 });
    preview.progress(1);
    const svg = host.querySelector('svg')?.cloneNode(true);
    if (!svg) throw new Error('The chart did not produce a preview.');
    // Capture computed styles so the standalone SVG keeps the real chart colors.
    const originals = host.querySelectorAll('svg, svg *');
    const copies = [svg, ...svg.querySelectorAll('*')];
    // Runtime identity attributes can contain control-character separators,
    // which are legal in DOM attributes but invalid in serialized XML.
    copies.forEach(node => {
      for (const attribute of [...node.attributes]) {
        if (attribute.name.startsWith('data-')) node.removeAttribute(attribute.name);
      }
    });
    originals.forEach((node, index) => {
      const style = getComputedStyle(node);
      for (const property of ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family']) copies[index].style.setProperty(property, style.getPropertyValue(property));
    });
    const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    if (request !== version || disposed) return null;
    return { id: ++nextId, label, datasetName: name, description, code: source, state: saved, rows: structuredClone(materialized), sourceRows: structuredClone(rows), image };
  } finally {
    preview?.destroy();
    host.remove();
    candidates.delete(host);
  }
}
async function display(frame, request, from = frame, animate = false) {
  const host = document.createElement('div');
  host.className = 'playground-candidate';
  target.value.append(host);
  candidates.add(host);
  let next;
  try {
    next = await api.transition(from.state, frame.state, { target: host, height: 360 });
    if (request !== version || disposed) { next.destroy(); return; }
    next.progress(animate ? 0 : 1);
    controller?.destroy();
    target.value.replaceChildren(host);
    host.className = '';
    controller = next;
    activeId.value = frame.id;
    code.value = frame.code;
    tableRows.value = structuredClone(frame.rows);
    datasetName.value = frame.datasetName;
    error.value = '';
    status.value = 'Ready';
    deltaText.value = JSON.stringify(next.delta.stateChanges, null, 2);
    progress.value = animate ? 0 : 1;
    if (animate) {
      playing.value = true;
      next.play({ from: 0, to: 1, duration: 650 });
      const tick = () => {
        if (request !== version || disposed) return;
        progress.value = next.value;
        if (next.value < 1) raf = requestAnimationFrame(tick);
        else playing.value = false;
      };
      raf = requestAnimationFrame(tick);
    }
  } catch (cause) { next?.destroy(); throw cause; }
  finally { candidates.delete(host); if (next !== controller) host.remove(); }
}
async function loadPreset(id = selected.value) {
  if (!api || disposed) return;
  const request = cancel();
  selected.value = id;
  category.value = sample.value.category;
  status.value = 'Compiling';
  error.value = '';
  history.replaceState(null, '', `#${props.hashPrefix}/${id}`);
  try {
    const preset = sample.value;
    const rows = preset.dataUrl ? await d3.csv(preset.dataUrl, d3.autoType) : [];
    const name = preset.dataUrl?.split('/').at(-1)?.replace('.csv', '') ?? 'Demo dataset';
    const start = await makeFrame(preset.code.replace(/^const from\b/, 'const chart'), 'Start', rows, request, name, preset.description);
    if (!start) return;
    const end = await makeFrame(preset.toCode.replace(/^const to\b/, 'const chart'), 'End', rows, request, name, preset.description);
    if (!end) return;
    await display(start, request);
    if (request !== version) return;
    sourceRows = rows;
    frames.value = [start, end];
  } catch (cause) { fail(cause, request); }
}
function edit(value) {
  code.value = value;
  const request = cancel();
  status.value = 'Waiting for input';
  timer = setTimeout(() => save(request), 650);
}
async function save(request = cancel()) {
  if (!api || !active.value) return;
  if (code.value === active.value.code) { status.value = 'Ready'; error.value = ''; return; }
  const previous = active.value;
  const source = code.value;
  status.value = 'Compiling';
  try {
    const frame = await makeFrame(source, `Edit ${nextId + 1}`, previous.sourceRows ?? sourceRows, request);
    if (!frame) return;
    await display(frame, request, previous, true);
    if (request !== version) return;
    const index = frames.value.findIndex(f => f.id === previous.id);
    frames.value = [...frames.value.slice(0, index + 1), frame, ...frames.value.slice(index + 1)];
  } catch (cause) { fail(cause, request); }
}
async function selectFrame(frame, animate = false) {
  const previous = active.value;
  const request = cancel();
  try { await display(frame, request, previous ?? frame, animate); return request === version && !disposed; }
  catch (cause) { fail(cause, request); }
}
async function removeFrame(frame) {
  if (frames.value.length === 1) return;
  const index = frames.value.indexOf(frame);
  const remaining = frames.value.filter(f => f.id !== frame.id);
  // Restore even when deleting a non-selected frame, clearing any unsaved draft.
  const restored = await selectFrame(frame.id === activeId.value ? remaining[Math.max(0, index - 1)] : active.value);
  if (restored && !error.value) frames.value = remaining;
}
async function useDataset(dataset) {
  const previous = active.value;
  if (!api || !previous) return;
  const request = cancel();
  status.value = 'Compiling';
  try {
    const frame = await makeFrame(dataset.code, dataset.name, dataset.rows, request, dataset.name, `${dataset.rows.length} source records from ${dataset.name}. Edit the code to explore this dataset.`);
    if (!frame) return;
    await display(frame, request);
    if (request !== version) return;
    const index = frames.value.findIndex(item => item.id === previous.id);
    frames.value = [...frames.value.slice(0, index + 1), frame, ...frames.value.slice(index + 1)];
  } catch (cause) { fail(cause, request); }
}
function step(direction) {
  const index = frames.value.findIndex(f => f.id === activeId.value);
  const next = frames.value[index + direction];
  if (next) selectFrame(next, true);
}
function seek(value) {
  cancelAnimationFrame(raf);
  controller?.pause();
  playing.value = false;
  progress.value = Number(value);
  controller?.progress(progress.value);
}
onMounted(async () => {
  try {
    [api, factory] = await Promise.all([import('../../../dist/transition-entry.js'), lab.loadChart()]);
    if (disposed) return;
    await nextTick();
    observer = new ResizeObserver(() => controller?.resize());
    observer.observe(target.value);
    await loadPreset();
  } catch (cause) { fail(cause, version); }
});
onBeforeUnmount(() => {
  disposed = true;
  cancel();
  observer?.disconnect();
  controller?.destroy();
  candidates.forEach(node => node.remove());
});
</script>

<template>
  <div class="syntax-playground snapshot-playground">
    <nav class="playground-example-nav" aria-label="Examples by state-change category">
      <span class="playground-nav-label">State-change category</span>
      <div class="playground-category-tabs" role="tablist" aria-label="The seven state-change categories">
        <button v-for="item in categories" :key="item" role="tab" :aria-selected="category === item" :class="{ 'is-active': category === item }" :disabled="!lab.scenarios.some(s => s.category === item)" @click="loadPreset(lab.scenarios.find(s => s.category === item).id)">
          <span class="playground-category-name"><span class="playground-category-icon"><StateChangeIcon :category="item" /></span>{{ item[0].toUpperCase() + item.slice(1) }}</span>
          <span class="playground-category-count">{{ lab.scenarios.filter(s => s.category === item).length }}</span>
        </button>
      </div>
      <div class="playground-example-list">
        <button v-for="item in lab.scenarios.filter(s => s.category === category)" :key="item.id" :data-scenario="item.id" :aria-pressed="selected === item.id" :class="{ 'is-active': selected === item.id }" @click="loadPreset(item.id)">{{ item.label.replace(/^\d+\s*·\s*/, '').replace(/^[^-]+\s+-\s+/, '') }}</button>
      </div>
    </nav>
    <div class="snapshot-film" aria-label="Saved chart snapshots">
      <article v-for="(frame, index) in frames" :key="frame.id" class="snapshot-frame" :class="{ 'is-active': frame.id === activeId }">
        <button class="snapshot-select" :aria-pressed="frame.id === activeId" :aria-label="`Select ${frame.label} snapshot`" @click="selectFrame(frame)">
          <img :src="frame.image" alt="" /><span><small>{{ String(index + 1).padStart(2, '0') }}</small>{{ frame.label }}</span>
        </button>
        <button class="snapshot-delete" :aria-label="`Delete ${frame.label} snapshot`" :disabled="frames.length === 1" @click="removeFrame(frame)">×</button>
      </article>
      <p v-if="!frames.length">Rendering snapshots…</p>
    </div>
    <div id="snapshot-workspace" class="snapshot-workspace">
      <section class="snapshot-data data-code-chart-data" aria-label="Snapshot data">
        <header class="snapshot-panel-head"><strong>Rows</strong><span>{{ tableRows.length }} records</span></header>
        <div class="snapshot-data-tools"><span :title="datasetName">{{ datasetName }}</span><PlaygroundDataPicker :chart="lab.chart" :busy="status === 'Compiling' || !active" @load="useDataset" /></div>
        <div class="snapshot-table-scroll">
          <table class="data-code-chart-table"><thead><tr><th v-for="field in columns" :key="field">{{ field }}</th></tr></thead><tbody><tr v-for="(row, index) in tableRows" :key="index"><td v-for="field in columns" :key="field">{{ row[field] ?? '∅' }}</td></tr></tbody></table>
        </div>
      </section>
      <section class="snapshot-code data-code-chart-code" aria-label="Chart code editor">
        <div class="playground-editor-pane">
          <div class="playground-toolbar"><span class="snapshot-file">chart.js <small>{{ active?.label }}</small></span><span class="playground-status" :data-kind="error ? 'error' : status === 'Ready' ? 'ready' : 'busy'">{{ status }}</span><button @click="save()">Save frame <kbd>⌘↵</kbd></button><button @click="loadPreset()">Reset</button></div>
          <label class="playground-code-cell"><EditableCodeCell :model-value="code" dark aria-label="Editable VisDelta code" @update:model-value="edit" @run="save()" /></label>
          <div v-if="error" role="alert" class="snapshot-error">{{ error }}</div>
          <p class="playground-contract">Edit the code. The chart follows.<br />Valid edits save automatically · ⌘/Ctrl + Enter to save now.</p>
        </div>
      </section>
      <section class="snapshot-chart data-code-chart-chart" aria-label="Floating chart preview">
        <header class="snapshot-panel-head"><strong><i></i> Live preview</strong><output>{{ playing ? 'Playing → ' : '' }}{{ active?.label }}</output></header>
        <div class="playground-output-pane">
          <div class="playground-chart-stage"><div ref="target" class="playground-chart" aria-label="Editable syntax output"></div></div>
          <p class="playground-description">{{ active?.description }}</p>
          <input type="range" min="0" max="1" step="0.01" :value="progress" aria-label="Playground transition progress" @input="seek($event.target.value)" />
          <div class="playground-output-actions"><button :disabled="!active || active.id === frames[0]?.id" @click="step(-1)">← Previous</button><button @click="seek(progress)">Pause</button><button :disabled="!active || active.id === frames.at(-1)?.id" @click="step(1)">Play next →</button></div>
          <details><summary>Inspect computed state difference</summary><DocsCodeBlock :code="deltaText" language="json" /></details>
        </div>
      </section>
    </div>
  </div>
</template>

<style src="./snapshotPlayground.css"></style>
