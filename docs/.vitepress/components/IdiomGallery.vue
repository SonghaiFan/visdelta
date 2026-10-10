<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import * as d3 from 'd3';
import StateChangeIcon from './StateChangeIcon.vue';

// Every idiom is the To state of a real Playground scenario. The gallery runs
// the same declarations, data and transition entry as the Playground, so a
// card cannot show a picture the library does not produce.
const labModules = import.meta.glob('../../../examples/*/scenarios.js', { eager: true });
const labs = Object.fromEntries(
  Object.values(labModules)
    .filter(module => module.chart && Array.isArray(module.scenarios) && typeof module.loadChart === 'function')
    .map(module => [module.chart, {
      loadChart: module.loadChart,
      scenarios: Object.fromEntries(module.scenarios.map(scenario => [scenario.id, scenario]))
    }])
);

const families = [
  { key: 'comparison', label: 'Comparison', summary: 'Compare one measure across categories.' },
  { key: 'part', label: 'Part to whole', summary: 'Show how parts compose a total.' },
  { key: 'trend', label: 'Change over time', summary: 'Follow a measure along ordered time.' },
  { key: 'relationship', label: 'Relationship', summary: 'Relate two or more measures per observation.' },
  { key: 'count', label: 'Count and distribution', summary: 'One mark per observation or per represented quantity.' },
  { key: 'emphasis', label: 'Emphasis', summary: 'Direct attention without removing context.' }
];

const idioms = [
  { family: 'comparison', chart: 'bar', scenario: 'measure', title: 'Bar chart' },
  { family: 'comparison', chart: 'bar', scenario: 'sort', title: 'Ranked bar chart' },
  { family: 'comparison', chart: 'bar', scenario: 'flip', title: 'Horizontal bar chart' },
  { family: 'comparison', chart: 'bar', scenario: 'layout', title: 'Grouped bar chart' },
  { family: 'comparison', chart: 'bar', scenario: 'color', title: 'Color-scaled bars' },
  { family: 'part', chart: 'bar', scenario: 'split', title: 'Stacked bar chart' },
  { family: 'part', chart: 'area', scenario: 'split', title: 'Stacked area chart' },
  { family: 'part', chart: 'area', scenario: 'stream', title: 'Streamgraph' },
  { family: 'part', chart: 'unit', scenario: 'unit-value', title: 'Quantity unit bars' },
  { family: 'trend', chart: 'line', scenario: 'x', title: 'Line chart' },
  { family: 'trend', chart: 'line', scenario: 'split', title: 'Multi-series line chart' },
  { family: 'trend', chart: 'line', scenario: 'style', title: 'Step line' },
  { family: 'trend', chart: 'line', scenario: 'log', title: 'Log-scale line' },
  { family: 'trend', chart: 'line', scenario: 'shift', title: 'Sliding time window' },
  { family: 'trend', chart: 'area', scenario: 'y', title: 'Area chart' },
  { family: 'trend', chart: 'area', scenario: 'baseline', title: 'Baseline area' },
  { family: 'relationship', chart: 'point', scenario: 'x', title: 'Scatterplot' },
  { family: 'relationship', chart: 'point', scenario: 'color', title: 'Categorical scatterplot' },
  { family: 'relationship', chart: 'point', scenario: 'size', title: 'Bubble chart' },
  { family: 'relationship', chart: 'point', scenario: 'rollup', title: 'Aggregated scatterplot' },
  { family: 'count', chart: 'unit', scenario: 'color', title: 'Unit chart' },
  { family: 'count', chart: 'unit', scenario: 'bar', title: 'Unit bar chart' },
  { family: 'count', chart: 'unit', scenario: 'beeswarm', title: 'Beeswarm' },
  { family: 'count', chart: 'unit', scenario: 'force', title: 'Force-clustered units' },
  { family: 'emphasis', chart: 'bar', scenario: 'highlight', title: 'Highlighted bars' },
  { family: 'emphasis', chart: 'line', scenario: 'highlight', title: 'Highlighted series' },
  { family: 'emphasis', chart: 'area', scenario: 'highlight-range', title: 'Highlighted time range' },
  { family: 'emphasis', chart: 'point', scenario: 'focus', title: 'Focus and context' }
]
  .filter(idiom => labs[idiom.chart]?.scenarios[idiom.scenario])
  .map(idiom => {
    const scenario = labs[idiom.chart].scenarios[idiom.scenario];
    return {
      ...idiom,
      id: `${idiom.chart}-${idiom.scenario}`,
      category: scenario.category,
      description: scenario.description,
      syntax: syntaxDelta(scenario.code, scenario.toCode)
    };
  });

const chartLabels = { bar: 'Bar', line: 'Line', area: 'Area', point: 'Point', unit: 'Unit' };
const chartOptions = ['all', ...Object.keys(chartLabels).filter(chart => idioms.some(idiom => idiom.chart === chart))];
const familyFilter = ref('all');
const chartFilter = ref('all');
const states = ref(Object.fromEntries(idioms.map(idiom => [idiom.id, { status: 'Waiting', error: '', progress: 0 }])));

const visibleIdioms = computed(() => idioms.filter(idiom =>
  (familyFilter.value === 'all' || idiom.family === familyFilter.value) &&
  (chartFilter.value === 'all' || idiom.chart === chartFilter.value)));
const visibleFamilies = computed(() => families
  .map(family => ({ ...family, idioms: visibleIdioms.value.filter(idiom => idiom.family === family.key) }))
  .filter(family => family.idioms.length));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const targets = new Map();
const controllers = new Map();
const frames = new Map();
const pending = new Set();
const dataCache = new Map();
let transitionApi = null;
let observer = null;
let resizeObserver = null;
let reducedMotion = false;
let disposed = false;

function syntaxDelta(fromCode, toCode) {
  const fromLines = new Set(fromCode.split('\n').map(line => line.trim().replace(/;$/, '')));
  const changed = toCode.split('\n')
    .map(line => line.trim().replace(/;$/, ''))
    .filter(line => line && !fromLines.has(line) && !/^const to =/.test(line));
  return changed.join(' ') || toCode.split('\n').at(-1).trim();
}

function setState(id, patch) {
  states.value = { ...states.value, [id]: { ...states.value[id], ...patch } };
}

function registerTarget(id, element) {
  const previous = targets.get(id);
  if (element === previous) return;
  if (previous) releaseIdiom(id, previous);
  if (!element) return;
  targets.set(id, element);
  observer?.observe(element);
}

// Filtering unmounts cards. Release their controllers so a card that returns
// renders again into its new element instead of keeping a detached chart.
function releaseIdiom(id, element) {
  observer?.unobserve(element);
  resizeObserver?.unobserve(element);
  cancelAnimationFrame(frames.get(id));
  controllers.get(id)?.destroy();
  controllers.delete(id);
  pending.delete(id);
  targets.delete(id);
  setState(id, { status: 'Waiting', error: '', progress: 0 });
}

onMounted(async () => {
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) controllers.get(entry.target.dataset.idiom)?.resize();
  });
  observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        renderIdiom(entry.target.dataset.idiom);
      }
    }, { rootMargin: '200px' })
    : null;
  await nextTick();
  for (const [id, element] of targets) {
    if (observer) observer.observe(element);
    else renderIdiom(id);
  }
});

onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  resizeObserver?.disconnect();
  for (const frame of frames.values()) cancelAnimationFrame(frame);
  for (const controller of controllers.values()) controller.destroy();
  controllers.clear();
});

async function loadRows(url) {
  if (!url) return [];
  if (!dataCache.has(url)) dataCache.set(url, d3.csv(url, d3.autoType));
  return structuredClone(await dataCache.get(url));
}

async function evaluateCell(source, name, factory, chart, rows) {
  const run = new AsyncFunction(chart, 'd3', 'rows', `"use strict";\n${source}\nreturn ${name};`);
  return run(factory, d3, rows);
}

async function renderIdiom(id) {
  const idiom = idioms.find(candidate => candidate.id === id);
  const target = targets.get(id);
  if (!idiom || !target || controllers.has(id) || pending.has(id) || disposed) return;
  pending.add(id);
  setState(id, { status: 'Rendering' });
  try {
    const scenario = labs[idiom.chart].scenarios[idiom.scenario];
    transitionApi ??= await import('../../../dist/transition-entry.js');
    const [factory, rows] = await Promise.all([
      labs[idiom.chart].loadChart(),
      loadRows(scenario.dataUrl)
    ]);
    const from = await evaluateCell(scenario.code, 'from', factory, idiom.chart, rows);
    const to = await evaluateCell(scenario.toCode, 'to', factory, idiom.chart, structuredClone(rows));
    if (disposed || targets.get(id) !== target) return;
    const controller = await transitionApi.transition(from, to, { target, height: 230 });
    if (disposed || targets.get(id) !== target) {
      controller.destroy();
      return;
    }
    pending.delete(id);
    controllers.set(id, controller);
    resizeObserver.observe(target);
    setState(id, { status: 'Ready' });
    if (reducedMotion) seek(id, 1);
    else play(id);
  } catch (cause) {
    pending.delete(id);
    setState(id, { status: 'Error', error: cause instanceof Error ? cause.message : String(cause) });
  }
}

function seek(id, value) {
  const controller = controllers.get(id);
  if (!controller) return;
  cancelAnimationFrame(frames.get(id));
  controller.progress(value);
  setState(id, { progress: value });
}

function play(id, from = 0, to = 1) {
  const controller = controllers.get(id);
  if (!controller) return;
  cancelAnimationFrame(frames.get(id));
  controller.progress(from);
  controller.play({ from, to, duration: 1600 });
  const track = () => {
    const value = controller.value;
    setState(id, { progress: value });
    if (Math.abs(value - to) > 0.001 && !disposed) frames.set(id, requestAnimationFrame(track));
  };
  frames.set(id, requestAnimationFrame(track));
}

function toggle(id) {
  const progress = states.value[id]?.progress ?? 0;
  if (progress > 0.5) play(id, progress, 0);
  else play(id, progress, 1);
}

function categoryLabel(category) {
  return category ? category[0].toUpperCase() + category.slice(1) : '';
}
</script>

<template>
  <section class="idiom-gallery" aria-label="Visual idioms">
    <div class="idiom-filters">
      <div class="idiom-filter-group">
        <span class="ui-label">Idiom</span>
        <div class="ui-tabs" role="group" aria-label="Filter by idiom family">
          <button type="button" :aria-pressed="familyFilter === 'all'" @click="familyFilter = 'all'">All</button>
          <button
            v-for="family in families"
            :key="family.key"
            type="button"
            :aria-pressed="familyFilter === family.key"
            @click="familyFilter = family.key"
          >{{ family.label }}</button>
        </div>
      </div>
      <div class="idiom-filter-group">
        <span class="ui-label">Chart</span>
        <div class="ui-tabs" role="group" aria-label="Filter by chart module">
          <button
            v-for="chart in chartOptions"
            :key="chart"
            type="button"
            :aria-pressed="chartFilter === chart"
            @click="chartFilter = chart"
          >{{ chart === 'all' ? 'All' : chartLabels[chart] }}</button>
        </div>
        <output>{{ visibleIdioms.length }} / {{ idioms.length }}</output>
      </div>
    </div>

    <section v-for="family in visibleFamilies" :key="family.key" class="idiom-family" :aria-labelledby="`idiom-family-${family.key}`">
      <header class="idiom-family-head">
        <h2 :id="`idiom-family-${family.key}`">{{ family.label }}</h2>
        <p>{{ family.summary }}</p>
      </header>
      <div class="idiom-grid">
        <article v-for="idiom in family.idioms" :key="idiom.id" class="idiom-card" :data-idiom="idiom.id">
          <div class="idiom-card-stage">
            <div
              :ref="element => registerTarget(idiom.id, element)"
              class="idiom-card-chart"
              :data-idiom="idiom.id"
              :aria-label="`${idiom.title}, rendered by VisDelta`"
            ></div>
            <p v-if="states[idiom.id].status !== 'Ready'" class="idiom-card-status" :class="{ 'is-error': states[idiom.id].error }" :role="states[idiom.id].error ? 'alert' : undefined">
              {{ states[idiom.id].error || `${states[idiom.id].status}…` }}
            </p>
            <span class="idiom-card-progress" aria-hidden="true" :style="{ transform: `scaleX(${states[idiom.id].progress})` }"></span>
          </div>
          <div class="idiom-card-body">
            <div class="idiom-card-meta">
              <span class="ui-chip">{{ chartLabels[idiom.chart] }}</span>
              <span class="idiom-card-change" :title="`Reached through a ${idiom.category} change`">
                <span class="state-icon-tile" aria-hidden="true"><StateChangeIcon :category="idiom.category" /></span>
                {{ categoryLabel(idiom.category) }}
              </span>
            </div>
            <h3>{{ idiom.title }}</h3>
            <p>{{ idiom.description }}</p>
            <code class="idiom-card-syntax" :title="idiom.syntax">{{ idiom.syntax }}</code>
          </div>
          <div class="idiom-card-actions">
            <button
              type="button"
              :disabled="states[idiom.id].status !== 'Ready'"
              @click="toggle(idiom.id)"
            >{{ states[idiom.id].progress > 0.5 ? '← Reverse' : 'Play →' }}</button>
            <a :href="`./playground.html#${idiom.chart}/${idiom.scenario}`">Open in Playground</a>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
