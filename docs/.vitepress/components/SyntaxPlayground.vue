<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as d3 from 'd3';

const labModules = import.meta.glob('../../../examples/*/scenarios.js', { eager: true });

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const props = defineProps({
  initial: { type: String, default: 'measure' },
  compact: { type: Boolean, default: false },
  mode: { type: String, default: 'all' }
});

const samples = {
  measure: {
    label: 'Change measure',
    code: `const revenue = bar(rows)
  .x("category")
  .y("sales", { title: "Revenue" })
  .key("category")
  .color("#1c6ae4");

const profit = revenue
  .y("profit", { title: "Profit" })
  .color("#03a86c");

return { from: revenue, to: profit };`
  },
  filter: {
    label: 'Filter with where()',
    code: `const all = bar(rows)
  .x("category")
  .y("sales")
  .key("category");

const northOnly = all.where({ region: "North" });

return { from: all, to: northOnly };`
  },
  focus: {
    label: 'Focus the view',
    code: `const all = bar(rows)
  .x("category")
  .y("sales")
  .key("category");

const northView = all.focus({ region: "North" });

return { from: all, to: northView };`
  },
  highlight: {
    label: 'Highlight a subset',
    code: `const all = bar(rows)
  .x("category")
  .y("sales")
  .key("category");

const focused = all.highlight(
  { category: "Software" },
  { opacity: 0.12 }
);

return { from: all, to: focused };`
  },
  split: {
    label: 'Break down bars',
    code: `const detailed = bar(segments)
  .x("category")
  .y("sales")
  .key(["category", "segment"])
  .breakdown("segment", {
    color: ["#1c6ae4", "#fa4d1d"]
  });

const total = detailed.rollup();

return { from: total, to: detailed };`
  },
  flip: {
    label: 'Flip orientation',
    code: `const vertical = bar(rows)
  .x("category")
  .y("sales")
  .key("category");

const horizontal = vertical.flip();

return { from: vertical, to: horizontal };`
  },
  line: {
    label: 'Line chart',
    code: `const sales = line(series)
  .x("quarter")
  .y("sales")
  .key("quarter")
  .curve("curveMonotoneX")
  .pointSize(4);

const profit = sales.y("profit");

return { from: sales, to: profit };`
  },
  point: {
    label: 'Point chart',
    code: `const sales = point(series)
  .x("sales")
  .y("profit")
  .key("quarter")
  .radius(6);

const reordered = sales
  .x("profit")
  .y("sales")
  .color("#fa4d1d");

return { from: sales, to: reordered };`
  },
  area: {
    label: 'Area chart',
    code: `const sales = area(series)
  .x("quarter")
  .y("sales")
  .key("quarter")
  .color("#1c6ae4");

const profit = sales.y("profit");

return { from: sales, to: profit };`
  },
  unit: {
    label: 'Unit chart',
    code: `const grid = unit(units)
  .value("count", { maxUnits: 80 })
  .key("team")
  .layout("grid", { columns: 10, radius: 4 });

const grouped = grid
  .group("team")
  .layout("bar", { columns: 3 })
  .color("team");

return { from: grid, to: grouped };`
  }
};

const labSamples = Object.fromEntries(
  Object.values(labModules)
    .filter(module => module.chart && Array.isArray(module.scenarios) && typeof module.loadChart === 'function')
    .map(module => [
      `${module.chart}-lab`,
      {
        chart: module.chart,
        loadChart: module.loadChart,
        samples: Object.fromEntries(module.scenarios.map(sample => [sample.id, sample]))
      }
    ])
);
const isLabMode = computed(() => Boolean(labSamples[props.mode]));
const labChart = computed(() => labSamples[props.mode]?.chart ?? null);
const availableSamples = computed(() => labSamples[props.mode]?.samples ?? samples);

const rows = [
  { category: 'Hardware', region: 'North', sales: 86, profit: 34 },
  { category: 'Software', region: 'South', sales: 64, profit: 49 },
  { category: 'Services', region: 'North', sales: 51, profit: 27 },
  { category: 'Support', region: 'South', sales: 39, profit: 18 }
];

const segments = [
  { category: 'Hardware', segment: 'Consumer', sales: 46 },
  { category: 'Hardware', segment: 'Business', sales: 40 },
  { category: 'Software', segment: 'Consumer', sales: 37 },
  { category: 'Software', segment: 'Business', sales: 27 },
  { category: 'Services', segment: 'Consumer', sales: 29 },
  { category: 'Services', segment: 'Business', sales: 22 },
  { category: 'Support', segment: 'Consumer', sales: 21 },
  { category: 'Support', segment: 'Business', sales: 18 }
];

const series = [
  { quarter: 'Q1', sales: 28, profit: 12 },
  { quarter: 'Q2', sales: 47, profit: 24 },
  { quarter: 'Q3', sales: 39, profit: 19 },
  { quarter: 'Q4', sales: 66, profit: 34 }
];

const units = [
  { team: 'Core', count: 18 },
  { team: 'Design', count: 12 },
  { team: 'Data', count: 15 }
];

const chartTarget = ref(null);
// Keep server and client setup identical. The requested hash is applied after
// mount so VitePress can hydrate the server-rendered example without a mismatch.
const initialSample = availableSamples.value[props.initial]
  ? props.initial
  : Object.keys(availableSamples.value)[0];
const selected = ref(initialSample);
const code = ref(availableSamples.value[initialSample].code);
const status = ref('Loading runtime');
const error = ref('');
const progress = ref(isLabMode.value ? 0 : 0.5);
const autoRun = ref(true);
const pointEffect = ref('blend');
const hasChange = ref(false);
const deltaText = ref('Waiting for a valid state pair.');
const lineTransition = ref('');

let api = null;
let aq = null;
let change = null;
let debounceTimer = 0;
let runVersion = 0;
let resizeObserver = null;
let visibilityObserver = null;
let animationFrame = 0;
const drafts = new Map();

const statusKind = computed(() => error.value ? 'error' : status.value === 'Ready' ? 'ready' : 'busy');
const description = computed(() => availableSamples.value[selected.value]?.description ?? '');
const showPointEffect = computed(() =>
  labChart.value === 'point' && ['rollup', 'breakdown'].includes(selected.value));

onMounted(() => {
  if (isLabMode.value) {
    const requested = location.hash.slice(1);
    if (availableSamples.value[requested]) selected.value = requested;
  }
  if (!('IntersectionObserver' in window)) {
    initialize();
    return;
  }
  visibilityObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    initialize();
  }, { rootMargin: '240px' });
  visibilityObserver.observe(chartTarget.value.closest('.syntax-playground'));
});

async function initialize() {
  try {
    const [runtime, arquero] = await Promise.all([
      isLabMode.value
        ? import('../../../dist/transition-entry.js')
        : import('../../../dist/visdelta.esm.js'),
      import('arquero')
    ]);
    api = runtime;
    aq = arquero;
    await nextTick();
    resizeObserver = new ResizeObserver(() => change?.resize());
    resizeObserver.observe(chartTarget.value);
    await runCode();
  } catch (cause) {
    showError(cause);
  }
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer);
  cancelAnimationFrame(animationFrame);
  visibilityObserver?.disconnect();
  resizeObserver?.disconnect();
  change?.destroy();
});

watch(code, () => {
  drafts.set(selected.value, code.value);
  if (!api) return;
  clearTimeout(debounceTimer);
  status.value = autoRun.value ? 'Waiting for input' : 'Edited · press Run';
  if (autoRun.value) debounceTimer = window.setTimeout(runCode, 450);
});

watch(selected, (next, previous) => {
  drafts.set(previous, code.value);
  code.value = drafts.get(next) ?? availableSamples.value[next].code;
  progress.value = 0;
  if (isLabMode.value && typeof history !== 'undefined') {
    history.replaceState(null, '', `#${next}`);
  }
  if (!autoRun.value) runCode();
});

watch(pointEffect, () => {
  if (api && showPointEffect.value) runCode();
});

function reset() {
  drafts.delete(selected.value);
  code.value = availableSamples.value[selected.value].code;
  if (!autoRun.value) runCode();
}

async function runCode() {
  if (!api || !chartTarget.value) return;
  const version = ++runVersion;
  clearTimeout(debounceTimer);
  cancelAnimationFrame(animationFrame);
  error.value = '';
  status.value = 'Compiling';
  let candidate = null;
  let nextChange = null;

  try {
    const isLab = isLabMode.value;
    const evaluate = isLab
      ? new AsyncFunction(labChart.value, 'd3', `"use strict";\n${code.value}`)
      : new AsyncFunction(
        'area', 'bar', 'line', 'point', 'unit', 'delta', 'rows', 'segments', 'series', 'units',
        `"use strict";\n${code.value}`
      );
    const authoredResult = isLab
      ? await evaluate(await labSamples[props.mode].loadChart(), d3)
      : await evaluate(
        api.area, api.bar, api.line, api.point, api.unit, api.delta,
        structuredClone(rows), structuredClone(segments), structuredClone(series), structuredClone(units)
      );
    const result = pointLabPair(authoredResult);
    if (version !== runVersion) return;
    if (!result?.from || !result?.to) {
      throw new Error('Return an object with { from, to } visualization states.');
    }

    candidate = document.createElement('div');
    candidate.className = 'playground-candidate';
    chartTarget.value.append(candidate);
    nextChange = await api.transition(result.from, result.to, {
      target: candidate,
      d3,
      aq,
      height: isLab ? 400 : 300
    });
    if (version !== runVersion) {
      nextChange.destroy();
      candidate.remove();
      return;
    }
    // Compile one middle frame so the Line Lab can show which Line-owned path
    // plan was selected, then restore the user's current frame.
    if (labChart.value === 'line') nextChange.progress(0.5);
    lineTransition.value = lineTransitionLabel(result, candidate);
    nextChange.progress(progress.value);
    change?.destroy();
    chartTarget.value.replaceChildren(candidate);
    candidate.className = '';
    change = nextChange;
    hasChange.value = true;
    deltaText.value = JSON.stringify({
      changed: change.delta.changed,
      deltas: change.delta.deltas,
      semantic: change.delta.semantic.deltas
    }, null, 2);
    status.value = 'Ready';
  } catch (cause) {
    nextChange?.destroy();
    candidate?.remove();
    if (version === runVersion) showError(cause);
  }
}

function pointLabPair(result) {
  if (!showPointEffect.value || pointEffect.value !== 'blend') return result;
  return {
    ...result,
    from: withPointLabEffect(result?.from),
    to: withPointLabEffect(result?.to)
  };
}

function withPointLabEffect(state) {
  if (!state) return state;
  const spec = structuredClone(typeof state.toSpec === 'function' ? state.toSpec() : state);
  const chartModule = typeof state.chartModule === 'function' ? state.chartModule() : null;
  spec.meta ||= {};
  spec.meta.state ||= {};
  spec.meta.state.sceneState ||= {};
  spec.meta.state.sceneState.detail = {
    ...(spec.meta.state.sceneState.detail || {}),
    effect: 'blend'
  };
  return {
    toSpec: () => structuredClone(spec),
    ...(chartModule ? { chartModule: () => chartModule } : {})
  };
}

function showError(cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  error.value = `${message}${change ? '\nShowing the last successful preview.' : ''}`;
  status.value = 'Error';
}

function readLineTransition(root) {
  const names = [...new Set(
    [...root.querySelectorAll('path.vd-line[data-line-transition]')]
      .map(node => node.getAttribute('data-line-transition'))
      .filter(name => name && name !== 'draw-line' && name !== 'remove-line')
  )];
  const labels = {
    'keep-shape': 'Keep shape',
    'move-points': 'Move points',
    'add-points': 'Add points',
    'remove-points': 'Remove points',
    'add-remove-points': 'Add and remove points',
    'change-curve': 'Change curve',
    'match-shape': 'Match shape'
  };
  return names.map(name => labels[name] || name).join(' + ');
}

function lineTransitionLabel(result, root) {
  if (labChart.value !== 'line') return '';
  const specs = [result?.from, result?.to].map(state =>
    typeof state?.toSpec === 'function' ? state.toSpec() : state);
  const focusesView = specs.some(spec =>
    spec?.meta?.state?.scopes?.focus?.mode === 'focus' ||
    spec?.meta?.state?.sceneState?.selection?.mode === 'focus');
  if (focusesView) return 'Focus view';
  const counts = specs.map(lineObservationCount);
  if (counts.every(Number.isFinite) && counts[0] !== counts[1]) {
    return counts[0] < counts[1] ? 'Add points' : 'Remove points';
  }
  return readLineTransition(root);
}

function lineObservationCount(spec) {
  const source = Array.isArray(spec?.data)
    ? spec.data
    : Array.isArray(spec?.data?.values) ? spec.data.values : null;
  if (!source) return null;
  let rows = source;
  for (const transform of spec.transform || []) {
    if (transform.filter) rows = rows.filter(row => playgroundFilterMatch(row, transform.filter));
    else if (transform.aggregate || transform.fold || transform.bin || transform.timeUnit || transform.limit != null) return null;
  }
  return rows.length;
}

function playgroundFilterMatch(row, filter) {
  if (!filter || typeof filter !== 'object') return true;
  const value = row[filter.field];
  if ('equal' in filter && value !== filter.equal) return false;
  if ('notEqual' in filter && value === filter.notEqual) return false;
  if ('oneOf' in filter && !filter.oneOf.includes(value)) return false;
  if ('gt' in filter && !(Number(value) > filter.gt)) return false;
  if ('gte' in filter && !(Number(value) >= filter.gte)) return false;
  if ('lt' in filter && !(Number(value) < filter.lt)) return false;
  if ('lte' in filter && !(Number(value) <= filter.lte)) return false;
  return true;
}

function setProgress(value) {
  progress.value = Math.max(0, Math.min(1, Number(value) || 0));
  change?.progress(progress.value);
}

function play(to) {
  if (!change) return;
  change.play({ duration: 800, from: change.value, to });
  cancelAnimationFrame(animationFrame);
  const update = () => {
    if (!change) return;
    progress.value = change.value;
    if (Math.abs(change.value - to) > 0.001) animationFrame = requestAnimationFrame(update);
  };
  animationFrame = requestAnimationFrame(update);
}

function pause() {
  change?.pause();
  cancelAnimationFrame(animationFrame);
  if (change) progress.value = change.value;
}

function handleEditorKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    runCode();
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    code.value = `${code.value.slice(0, start)}  ${code.value.slice(end)}`;
    nextTick(() => {
      input.selectionStart = input.selectionEnd = start + 2;
    });
  }
}
</script>

<template>
  <div class="syntax-playground" :class="{ 'is-compact': compact }">
    <div class="playground-toolbar">
      <label v-if="!compact">
        <span>Example</span>
        <select :id="isLabMode ? 'scenario' : undefined" v-model="selected" aria-label="Syntax example">
          <option v-for="(sample, key) in availableSamples" :key="key" :value="key">{{ sample.label }}</option>
        </select>
      </label>
      <label v-if="showPointEffect" class="playground-effect">
        <span>Effect</span>
        <select id="point-effect" v-model="pointEffect" aria-label="Point detail effect">
          <option value="clean">Clean</option>
          <option value="blend">Blend</option>
        </select>
      </label>
      <strong v-if="compact" class="playground-inline-title">{{ availableSamples[selected].label }}</strong>
      <label class="playground-auto">
        <input :id="isLabMode ? 'auto-run' : undefined" v-model="autoRun" type="checkbox" @change="autoRun && runCode()" />
        Auto-run
      </label>
      <button :id="isLabMode ? 'run' : undefined" type="button" @click="runCode">Run <kbd>⌘↵</kbd></button>
      <button :id="isLabMode ? 'reset' : undefined" type="button" @click="reset">Reset</button>
      <span :id="isLabMode ? 'status' : undefined" class="playground-status" :data-kind="statusKind">{{ status }}</span>
    </div>
    <p v-if="description" class="playground-description">{{ description }}</p>

    <div class="playground-grid">
      <div class="playground-editor-pane">
        <div class="playground-pane-label">Editable JavaScript</div>
        <textarea
          v-model="code"
          :id="isLabMode ? 'editor' : undefined"
          class="playground-editor"
          aria-label="Editable VisDelta code"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          @keydown="handleEditorKeydown"
        ></textarea>
        <p v-if="isLabMode" class="playground-contract"><code>{{ labChart }}</code> and <code>d3</code> are provided. Define the data and both states, then end with <code>return { from, to };</code>. Code runs locally in this page.</p>
        <p v-else class="playground-contract">Available: <code>area</code>, <code>bar</code>, <code>line</code>, <code>point</code>, <code>unit</code>, <code>delta</code>, plus <code>rows</code>, <code>segments</code>, <code>series</code>, and <code>units</code>. End with <code>return { from, to };</code>.</p>
      </div>

      <div class="playground-output-pane">
        <div class="playground-pane-label">Live output · progress <output :id="isLabMode ? 'value' : undefined">{{ progress.toFixed(2) }}</output></div>
        <div v-if="lineTransition" class="playground-line-plan">Line transition <strong>{{ lineTransition }}</strong></div>
        <div :id="isLabMode ? 'chart' : undefined" ref="chartTarget" class="playground-chart" aria-label="Editable syntax output"></div>
        <div v-if="error" class="playground-runtime-error" role="alert">{{ error }}</div>
        <input
          type="range"
          :id="isLabMode ? 'progress' : undefined"
          min="0"
          max="1"
          step="0.01"
          :value="progress"
          :disabled="!hasChange"
          aria-label="Playground transition progress"
          @input="setProgress($event.target.valueAsNumber)"
        />
        <div class="playground-output-actions">
          <button v-if="isLabMode" id="start" type="button" :disabled="!hasChange" @click="setProgress(0)">Start · 0</button>
          <button :id="isLabMode ? 'reverse' : undefined" type="button" :disabled="!hasChange" @click="play(0)">← Reverse</button>
          <button :id="isLabMode ? 'play' : undefined" type="button" :disabled="!hasChange" @click="play(1)">Play →</button>
          <button v-if="isLabMode" id="pause" type="button" :disabled="!hasChange" @click="pause">Pause</button>
          <button v-if="isLabMode" id="end" type="button" :disabled="!hasChange" @click="setProgress(1)">End · 1</button>
        </div>
        <details>
          <summary>Inspect computed delta</summary>
          <pre><code>{{ deltaText }}</code></pre>
        </details>
      </div>
    </div>
  </div>
</template>
