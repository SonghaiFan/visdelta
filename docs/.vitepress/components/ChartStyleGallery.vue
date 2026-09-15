<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const presetCopy = {
  d3: {
    name: 'D3',
    note: 'Familiar categorical colors, open axes, and softly rounded marks.',
    importName: 'd3ChartStyle'
  },
  paper: {
    name: 'Paper',
    note: 'Centered axis titles, a left-side y title, and a right-side legend.',
    importName: 'paperChartStyle'
  },
  dark: {
    name: 'Dark',
    note: 'Compact mono labels, a blueprint surface, and a monochrome blue scale.',
    importName: 'darkChartStyle'
  }
};

const pointRows = [
  { place: 'Albany', region: 'North', income: 42, health: 66, access: 63 },
  { place: 'Brighton', region: 'South', income: 51, health: 73, access: 76 },
  { place: 'Carlton', region: 'North', income: 68, health: 78, access: 81 },
  { place: 'Docklands', region: 'South', income: 76, health: 70, access: 74 },
  { place: 'Elwood', region: 'North', income: 84, health: 86, access: 89 },
  { place: 'Fitzroy', region: 'South', income: 57, health: 61, access: 69 }
];

const barRows = [
  { category: 'A', region: 'North', value: 28, next: 34 },
  { category: 'B', region: 'South', value: 47, next: 41 },
  { category: 'C', region: 'North', value: 39, next: 52 },
  { category: 'D', region: 'South', value: 66, next: 61 },
  { category: 'E', region: 'North', value: 58, next: 72 }
];

const seriesRows = [
  { id: 'Q1', period: 'Q1', sales: 28, next: 34 },
  { id: 'Q2', period: 'Q2', sales: 47, next: 43 },
  { id: 'Q3', period: 'Q3', sales: 39, next: 51 },
  { id: 'Q4', period: 'Q4', sales: 66, next: 62 },
  { id: 'Q5', period: 'Q5', sales: 58, next: 70 },
  { id: 'Q6', period: 'Q6', sales: 79, next: 74 }
];

const unitRows = [
  { id: 'A', team: 'Alpha', count: 10 },
  { id: 'B', team: 'Beta', count: 8 },
  { id: 'C', team: 'Gamma', count: 12 }
];

const demos = [
  {
    key: 'bar',
    name: 'Bar',
    note: 'length and category',
    states(api) {
      const from = api.bar(barRows)
        .x('category', { title: 'Category' })
        .y('value', { title: 'Value' })
        .key('category')
        .color('region');
      return [from, from.y('next', { title: 'Next value' })];
    }
  },
  {
    key: 'point',
    name: 'Point',
    note: 'position and color',
    states(api) {
      const from = api.point(pointRows)
        .x('income', { title: 'Income' })
        .y('health', { title: 'Health' })
        .key('place')
        .color('region');
      return [from, from.y('access', { title: 'Access' })];
    }
  },
  {
    key: 'line',
    name: 'Line',
    note: 'sequence and change',
    states(api) {
      const from = api.line(seriesRows)
        .x('period', { title: 'Period' })
        .y('sales', { title: 'Sales' })
        .key('id');
      return [from, from.y('next', { title: 'Forecast' })];
    }
  },
  {
    key: 'area',
    name: 'Area',
    note: 'magnitude over sequence',
    states(api) {
      const from = api.area(seriesRows)
        .x('period', { title: 'Period' })
        .y('sales', { title: 'Sales' })
        .key('id');
      return [from, from.y('next', { title: 'Forecast' })];
    }
  },
  {
    key: 'unit',
    name: 'Unit',
    note: 'individual counts',
    states(api) {
      const from = api.unit(unitRows)
        .value('count', { maxUnits: 60 })
        .key('id')
        .layout('grid', { columns: 10, radius: 5 });
      const to = from
        .group('team')
        .layout('bar', { columns: 4, radius: 5 })
        .color('team');
      return [from, to];
    }
  }
];

const targets = new Map();
const selected = ref('d3');
const progress = ref(0.5);
const status = ref('Loading previews');
const error = ref('');
const active = computed(() => presetCopy[selected.value]);
const snippet = computed(() => `import "visdelta/style.css";
import { ${active.value.importName}, transition } from "visdelta";

const change = await transition(from, to, {
  target: "#chart",
  chartStyle: ${active.value.importName}
});`);

let api = null;
let changes = new Map();
let resizeObserver = null;
let renderVersion = 0;

onMounted(async () => {
  try {
    api = await import('../../../dist/visdelta.esm.js');
    await nextTick();
    resizeObserver = new ResizeObserver(() => {
      for (const change of changes.values()) change.resize();
    });
    for (const target of targets.values()) resizeObserver.observe(target);
    await render();
  } catch (cause) {
    showError(cause);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  destroyChanges(changes);
});

watch(selected, render);

function setTarget(key, element) {
  if (element) targets.set(key, element);
  else targets.delete(key);
}

async function render() {
  if (!api || demos.some(({ key }) => !targets.has(key))) return;
  const version = ++renderVersion;
  status.value = 'Applying style';
  error.value = '';
  const candidates = new Map();
  const nextChanges = new Map();

  try {
    await Promise.all(demos.map(async demo => {
      const target = targets.get(demo.key);
      const candidate = document.createElement('div');
      candidate.className = 'style-gallery-candidate';
      target.append(candidate);
      candidates.set(demo.key, candidate);

      const [from, to] = demo.states(api);
      const next = await api.transition(from, to, {
        target: candidate,
        height: 250,
        chartStyle: api.chartStylePresets[selected.value]
      });
      nextChanges.set(demo.key, next);
    }));

    if (version !== renderVersion) {
      destroyChanges(nextChanges);
      removeCandidates(candidates);
      return;
    }

    for (const next of nextChanges.values()) next.progress(progress.value);
    destroyChanges(changes);
    for (const demo of demos) {
      const candidate = candidates.get(demo.key);
      targets.get(demo.key).replaceChildren(candidate);
      candidate.className = '';
    }
    changes = nextChanges;
    status.value = `${active.value.name} active · ${demos.length} charts`;
  } catch (cause) {
    destroyChanges(nextChanges);
    removeCandidates(candidates);
    if (version === renderVersion) showError(cause);
  }
}

function setProgress(value) {
  progress.value = Math.max(0, Math.min(1, Number(value) || 0));
  for (const change of changes.values()) change.progress(progress.value);
}

function destroyChanges(items) {
  for (const change of items.values()) change.destroy();
}

function removeCandidates(items) {
  for (const candidate of items.values()) candidate.remove();
}

function showError(cause) {
  error.value = cause instanceof Error ? cause.message : String(cause);
  status.value = 'Preview unavailable';
}
</script>

<template>
  <section class="style-gallery" aria-labelledby="style-gallery-title">
    <div class="style-gallery-head">
      <div>
        <h2 id="style-gallery-title">Switch the whole chart style</h2>
        <p>One preset updates Bar, Point, Line, Area, and Unit without changing their data or transition.</p>
      </div>
      <span class="style-gallery-status" aria-live="polite">{{ status }}</span>
    </div>

    <div class="style-gallery-picker" role="group" aria-label="Chart style preset">
      <button
        v-for="(preset, key) in presetCopy"
        :key="key"
        type="button"
        :aria-pressed="selected === key"
        :class="{ 'is-active': selected === key }"
        @click="selected = key"
      >
        <strong>{{ preset.name }}</strong>
        <span>{{ preset.note }}</span>
      </button>
    </div>

    <div class="style-gallery-stage">
      <div class="style-gallery-preview">
        <div class="style-gallery-charts" aria-label="Live previews for all chart types">
          <section v-for="demo in demos" :key="demo.key" class="style-gallery-example">
            <header>
              <strong>{{ demo.name }}</strong>
              <span>{{ demo.note }}</span>
            </header>
            <div
              :ref="element => setTarget(demo.key, element)"
              class="style-gallery-chart"
              :aria-label="`${demo.name} style preview`"
            ></div>
          </section>
        </div>
        <p v-if="error" class="style-gallery-error" role="alert">{{ error }}</p>
        <label class="style-gallery-progress">
          <span>Shared transition</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="progress"
            aria-label="Style preview transition progress"
            @input="setProgress($event.target.valueAsNumber)"
          />
          <output>{{ progress.toFixed(2) }}</output>
        </label>
      </div>
      <pre class="style-gallery-code"><code>{{ snippet }}</code></pre>
    </div>
  </section>
</template>
