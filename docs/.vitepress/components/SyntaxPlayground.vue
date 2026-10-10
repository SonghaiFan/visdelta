<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as d3 from 'd3';
import StateChangeIcon from './StateChangeIcon.vue';
import DataCodeChart from './DataCodeChart.vue';
import EditableCodeCell from './EditableCodeCell.vue';

const labModules = import.meta.glob('../../../examples/*/scenarios.js', { eager: true });

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const props = defineProps({
  initial: { type: String, default: 'measure' },
  compact: { type: Boolean, default: false },
  mode: { type: String, default: 'all' },
  hashPrefix: { type: String, default: '' }
});

const samples = {
  measure: {
    label: 'Encoding - remap y',
    category: 'encoding',
    code: `const revenue = bar(rows)
  .x("category")
  .y("sales", { title: "Revenue" });

const profit = revenue.y("profit", { title: "Profit" });

return { from: revenue, to: profit };`
  },
  filter: {
    label: 'Data - remove records',
    category: 'data',
    code: `const all = bar(rows)
  .x("category")
  .y("sales");

const northOnly = all.where({ region: "North" });

return { from: all, to: northOnly };`
  },
  focus: {
    label: 'Attention - focus enter',
    category: 'attention',
    code: `const all = bar(rows)
  .x("category")
  .y("sales");

const northView = all.focus({ region: "North" });

return { from: all, to: northView };`
  },
  highlight: {
    label: 'Attention - highlight enter',
    category: 'attention',
    code: `const all = bar(rows)
  .x("category")
  .y("sales");

const focused = all.highlight(
  { category: "Software" },
  { opacity: 0.12 }
);

return { from: all, to: focused };`
  },
  split: {
    label: 'Grain - split marks',
    category: 'grain',
    code: `const detailed = bar(segments)
  .x("category")
  .y("sales")
  .breakdown("segment")
  .color("segment");

const total = detailed.rollup();

return { from: total, to: detailed };`
  },
  flip: {
    label: 'Coordinate - reorient',
    category: 'coordinate',
    code: `const vertical = bar(rows)
  .x("category")
  .y("sales");

const horizontal = vertical.flip();

return { from: vertical, to: horizontal };`
  },
  line: {
    label: 'Appearance - reshape line',
    category: 'appearance',
    code: `const sales = line(series)
  .x("quarter")
  .y("sales")
  .curve("curveMonotoneX")
  .pointSize(4);

const curved = sales.curve("curveBumpX");

return { from: sales, to: curved };`
  },
  unit: {
    label: 'Layout - rearrange units',
    category: 'layout',
    code: `const grid = unit(units)
  .value("count", { maxUnits: 80 })
  .key("team")
  .group("team")
  .layout("grid", { columns: 10, radius: 4 });

const arranged = grid.layout("bar", { columns: 3 });

return { from: grid, to: arranged };`
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
const ontologyCategories = [
  { key: 'data', label: 'Data' },
  { key: 'grain', label: 'Grain' },
  { key: 'encoding', label: 'Encoding' },
  { key: 'coordinate', label: 'Coordinate' },
  { key: 'layout', label: 'Layout' },
  { key: 'attention', label: 'Attention' },
  { key: 'appearance', label: 'Appearance' }
];

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
const activeCategory = ref(availableSamples.value[initialSample].category);
const initialCells = sampleCells(availableSamples.value[initialSample]);
const fromCode = ref(initialCells.from);
const toCode = ref(initialCells.to);
const status = ref('Loading runtime');
const error = ref('');
const progress = ref(isLabMode.value ? 0 : 0.5);
const autoRun = ref(true);
const pointEffect = ref('blend');
const hasChange = ref(false);
const deltaText = ref('Waiting for a valid state pair.');
const lineTransition = ref('');
const tableRows = ref([]);
const tableStatus = ref('Waiting for a valid state pair');
const tableEndpoint = ref('from');

let api = null;
let change = null;
let activePair = null;
let pendingSource = null;
let pendingProgress = 0;
let pendingReason = 'Applying edit';
let tabBridgeTarget = null;
let debounceTimer = 0;
let runVersion = 0;
let resizeObserver = null;
let visibilityObserver = null;
let animationFrame = 0;
let tableVersion = 0;
let tableState = null;
const drafts = new Map();
const dataCache = new Map();

const statusKind = computed(() => error.value ? 'error' : status.value === 'Ready' ? 'ready' : 'busy');
const description = computed(() => availableSamples.value[selected.value]?.description ?? '');
const samplesByCategory = computed(() => Object.entries(availableSamples.value).reduce((groups, [key, sample]) => {
  (groups[sample.category] ||= []).push({ key, ...sample });
  return groups;
}, {}));
const activeSamples = computed(() => samplesByCategory.value[activeCategory.value] ?? []);
const showPointEffect = computed(() =>
  labChart.value === 'point' && ['rollup', 'breakdown'].includes(selected.value));

onMounted(() => {
  if (isLabMode.value) {
    const hash = location.hash.slice(1);
    const requested = props.hashPrefix && hash.startsWith(`${props.hashPrefix}/`)
      ? hash.slice(props.hashPrefix.length + 1)
      : hash;
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
    api = isLabMode.value
      ? await import('../../../dist/transition-entry.js')
      : await import('../../../dist/visdelta.esm.js');
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

watch([fromCode, toCode], () => {
  drafts.set(selected.value, { from: fromCode.value, to: toCode.value });
  if (!api) return;
  queueCurrentEndpoint('Applying edit');
  clearTimeout(debounceTimer);
  status.value = autoRun.value ? 'Waiting for input' : 'Edited · press Run';
  if (autoRun.value) debounceTimer = window.setTimeout(runCode, 450);
});

watch(selected, (next, previous) => {
  // A rendered intermediate frame is not an immutable chart state. Bridge
  // from the nearest authored endpoint, then install the new tab's own pair.
  pendingSource = isLabMode.value && change
    ? (tabBridgeTarget ?? (activePair
      ? (change.value < 0.5 ? activePair.from : activePair.to)
      : null))
    : null;
  pendingProgress = 0;
  pendingReason = 'Switching tabs';
  progress.value = 0;
  drafts.set(previous, { from: fromCode.value, to: toCode.value });
  const cells = drafts.get(next) ?? sampleCells(availableSamples.value[next]);
  fromCode.value = cells.from;
  toCode.value = cells.to;
  activeCategory.value = availableSamples.value[next].category;
  if (isLabMode.value && typeof history !== 'undefined') {
    history.replaceState(null, '', `#${props.hashPrefix ? `${props.hashPrefix}/` : ''}${next}`);
  }
  if (api) nextTick(() => {
    clearTimeout(debounceTimer);
    runCode();
  });
});

function chooseCategory(category) {
  const first = samplesByCategory.value[category]?.[0];
  if (!first) return;
  activeCategory.value = category;
  selected.value = first.key;
}

function sampleLabel(label) {
  return label.replace(/^\d+\s*·\s*/, '').replace(/^[^-]+\s+-\s+/, '');
}

function sampleCells(sample) {
  if (sample?.toCode != null) {
    return { from: sample.code ?? '', to: sample.toCode, dataUrl: sample.dataUrl ?? null };
  }
  const source = sample?.code ?? '';
  const match = source.match(/^([\s\S]*?)\n\nconst from = ([\s\S]*?);\nconst to = ([\s\S]*?);\n\nreturn \{ from, to \};\s*$/);
  if (!match) return { from: source, to: '', dataUrl: null };
  const [, rawSetup, fromExpression, toExpression] = match;
  const dataUrl = rawSetup.match(/const DATA_URL = ["']([^"']+)["'];/)?.[1] ?? null;
  const setup = rawSetup
    .replace(/^const DATA_URL = ["'][^"']+["'];\s*/m, '')
    .replace(/^const rows = await d3\.csv\(DATA_URL, d3\.autoType\);\s*/m, '')
    .replaceAll('{ url: DATA_URL }', 'rows')
    .trim();
  return {
    from: isolatedStateCell('from', setup, fromExpression),
    to: isolatedStateCell('to', setup, toExpression),
    dataUrl
  };
}

function isolatedStateCell(name, setup, expression) {
  if (!setup) return `const ${name} = ${expression};`;
  const body = setup.split('\n').map(line => `  ${line}`).join('\n');
  return `const ${name} = (() => {\n${body}\n\n  return ${expression};\n})();`;
}

watch(pointEffect, () => {
  if (api && showPointEffect.value) {
    queueCurrentEndpoint('Applying effect');
    runCode();
  }
});

function queueCurrentEndpoint(reason) {
  if (!change || !activePair || pendingSource) return;
  pendingProgress = change.value < 0.5 ? 0 : 1;
  pendingSource = tabBridgeTarget ?? (pendingProgress === 0 ? activePair.from : activePair.to);
  pendingReason = reason;
}

function reset() {
  drafts.delete(selected.value);
  const cells = sampleCells(availableSamples.value[selected.value]);
  fromCode.value = cells.from;
  toCode.value = cells.to;
  if (!autoRun.value) runCode();
}

async function runCode() {
  if (!api || !chartTarget.value) return;
  const version = ++runVersion;
  clearTimeout(debounceTimer);
  cancelAnimationFrame(animationFrame);
  error.value = '';
  status.value = 'Compiling';
  const updateSource = pendingSource;
  const updateProgress = pendingProgress;
  const updateReason = pendingReason;
  pendingSource = null;

  try {
    const isLab = isLabMode.value;
    const cells = sampleCells(availableSamples.value[selected.value]);
    const sharedRows = isLab ? await loadSampleRows(cells.dataUrl) : null;
    const parameterNames = isLab
      ? [labChart.value, 'd3', 'rows']
      : ['area', 'bar', 'line', 'point', 'unit', 'delta', 'rows', 'segments', 'series', 'units'];
    const evaluateFrom = compileCell('From', parameterNames, fromCode.value, 'from');
    const evaluateTo = compileCell('To', parameterNames, toCode.value, 'to');
    const chartFactory = isLab ? await labSamples[props.mode].loadChart() : null;
    const sharedArguments = isLab
      ? [chartFactory, d3, sharedRows]
      : [
        api.area, api.bar, api.line, api.point, api.unit, api.delta,
        structuredClone(rows), structuredClone(segments), structuredClone(series), structuredClone(units)
      ];
    const authoredResult = {
      from: await evaluateCell('From', evaluateFrom, sharedArguments),
      to: await evaluateCell('To', evaluateTo, sharedArguments)
    };
    const result = pointLabPair(authoredResult);
    if (version !== runVersion) return;
    if (!result?.from || !result?.to) {
      throw new Error('From and To must each assign a visualization state.');
    }

    if (updateSource) {
      await beginUpdateTransition(updateSource, result, updateProgress, updateReason, version, isLab ? 400 : 300);
      return;
    }
    await installPair(result, version, progress.value, isLab ? 400 : 300);
  } catch (cause) {
    if (version === runVersion) showError(cause);
  }
}

function compileCell(label, parameterNames, source, resultName) {
  try {
    return new AsyncFunction(...parameterNames, `"use strict";\n${source}\nreturn ${resultName};`);
  } catch (cause) {
    throw cellError(label, cause);
  }
}

async function evaluateCell(label, evaluate, args) {
  try {
    return await evaluate(...args);
  } catch (cause) {
    throw cellError(label, cause);
  }
}

function cellError(label, cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new Error(`${label}: ${message}`);
}

async function loadSampleRows(url) {
  if (!url) return [];
  if (!dataCache.has(url)) {
    dataCache.set(url, /\.json(?:[?#]|$)/i.test(url)
      ? d3.json(url)
      : d3.csv(url, d3.autoType));
  }
  return structuredClone(await dataCache.get(url));
}

function declaredMark(state) {
  return (typeof state?.toSpec === 'function' ? state.toSpec() : state)?.mark ?? null;
}

async function beginUpdateTransition(source, result, targetProgress, reason, version, height) {
  const target = targetProgress === 0 ? result.from : result.to;
  // A bridge animates one chart's states; switching chart type installs the new pair directly.
  if (declaredMark(source) !== declaredMark(target)) {
    await installPair(result, version, targetProgress, height);
    return;
  }
  const candidate = document.createElement('div');
  candidate.className = 'playground-candidate';
  chartTarget.value.append(candidate);
  let bridge = null;
  try {
    bridge = await api.transition(source, target, { target: candidate, height });
    if (version !== runVersion) {
      bridge.destroy();
      candidate.remove();
      return;
    }
    if (!bridge.delta.edits.length) {
      bridge.destroy();
      candidate.remove();
      await installPair(result, version, targetProgress, height);
      return;
    }
    bridge.progress(0);
    change?.destroy();
    chartTarget.value.replaceChildren(candidate);
    candidate.className = '';
    change = bridge;
    tabBridgeTarget = target;
    progress.value = targetProgress;
    hasChange.value = false;
    setDeltaText(bridge);
    status.value = reason;
    bridge.play({ duration: 600, from: 0, to: 1 });
    trackPlayback(bridge, 1, version, () => {
      installPair(result, version, targetProgress, height).catch(cause => {
        if (version === runVersion) showError(cause);
      });
    }, false);
  } catch (cause) {
    bridge?.destroy();
    candidate.remove();
    throw cause;
  }
}

async function installPair(result, version, initialProgress, height) {
  const candidate = document.createElement('div');
  candidate.className = 'playground-candidate';
  chartTarget.value.append(candidate);
  let nextChange = null;
  try {
    nextChange = await api.transition(result.from, result.to, { target: candidate, height });
    if (version !== runVersion) {
      nextChange.destroy();
      candidate.remove();
      return;
    }
    // Compile one middle frame so the Line Lab can show which Line-owned path
    // plan was selected, then restore the user's current frame.
    if (labChart.value === 'line') nextChange.progress(0.5);
    lineTransition.value = lineTransitionLabel(result, candidate, nextChange.delta);
    nextChange.progress(initialProgress);
    change?.destroy();
    chartTarget.value.replaceChildren(candidate);
    candidate.className = '';
    change = nextChange;
    activePair = result;
    tabBridgeTarget = null;
    progress.value = initialProgress;
    hasChange.value = true;
    setDeltaText(nextChange);
    await updateDataTable(initialProgress, result, version);
    status.value = 'Ready';
  } catch (cause) {
    nextChange?.destroy();
    candidate.remove();
    throw cause;
  }
}

function setDeltaText(controller) {
  deltaText.value = JSON.stringify({
    changed: controller.delta.changed,
    stateChanges: controller.delta.stateChanges,
    deltas: controller.delta.deltas,
    semantic: controller.delta.semantic.deltas
  }, null, 2);
}

function trackPlayback(controller, to, version, finished = null, reportProgress = true) {
  cancelAnimationFrame(animationFrame);
  const update = () => {
    if (version !== runVersion || change !== controller) return;
    // Entering a tab is not part of that tab's authored from → to timeline.
    if (reportProgress) {
      progress.value = controller.value;
      updateDataTable(controller.value, activePair, version);
    }
    if (Math.abs(controller.value - to) > 0.001) {
      animationFrame = requestAnimationFrame(update);
    } else {
      animationFrame = 0;
      finished?.();
    }
  };
  animationFrame = requestAnimationFrame(update);
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

function lineTransitionLabel(result, root, delta) {
  if (labChart.value !== 'line') return '';
  const specs = [result?.from, result?.to].map(state =>
    typeof state?.toSpec === 'function' ? state.toSpec() : state);
  const focusesView = specs.some(spec =>
    spec?.meta?.state?.scopes?.focus?.mode === 'focus' ||
    spec?.meta?.state?.sceneState?.selection?.mode === 'focus');
  if (focusesView) return 'Focus view';
  const dataActions = new Set((delta?.stateChanges ?? [])
    .filter(change => change.category === 'data').map(change => change.action));
  if (dataActions.has('add') && dataActions.has('remove')) return 'Add and remove points';
  if (dataActions.has('add')) return 'Add points';
  if (dataActions.has('remove')) return 'Remove points';
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
  updateDataTable(progress.value, activePair, runVersion);
}

async function updateDataTable(value, pair = activePair, version = runVersion) {
  if (!pair) return;
  const endpoint = value < 0.5 ? 'from' : 'to';
  const state = pair[endpoint];
  if (state === tableState && tableRows.value.length) return;
  const request = ++tableVersion;
  tableState = state;
  tableEndpoint.value = endpoint;
  tableStatus.value = `Loading ${endpoint} state`;
  try {
    const spec = state.toSpec();
    let source;
    if (Array.isArray(spec.data)) source = spec.data;
    else if (Array.isArray(spec.data?.values)) source = spec.data.values;
    else if (spec.data?.url) {
      const type = spec.data.type ?? spec.data.format?.type;
      source = type === 'json' || /\.json(?:[?#]|$)/i.test(spec.data.url)
        ? await d3.json(spec.data.url)
        : await d3.csv(spec.data.url, d3.autoType);
    }
    const rows = state.rows(source);
    if (request !== tableVersion || version !== runVersion) return;
    tableRows.value = rows;
    tableStatus.value = `${endpoint} state · ${rows.length} row${rows.length === 1 ? '' : 's'}`;
  } catch {
    if (request !== tableVersion || version !== runVersion) return;
    tableRows.value = [];
    tableStatus.value = `${endpoint} state · data unavailable`;
  }
}

function play(to) {
  if (!change) return;
  change.play({ duration: 800, from: change.value, to });
  trackPlayback(change, to, runVersion);
}

function pause() {
  change?.pause();
  cancelAnimationFrame(animationFrame);
  if (change) progress.value = change.value;
}

</script>

<template>
  <div class="syntax-playground" :class="{ 'is-compact': compact }">
    <nav v-if="!compact" class="playground-example-nav" aria-label="Examples by state-change category">
      <span class="playground-nav-label">State-change category</span>
      <div class="playground-category-tabs" role="tablist" aria-label="The seven state-change categories">
        <button
          v-for="category in ontologyCategories"
          :key="category.key"
          type="button"
          role="tab"
          :aria-selected="activeCategory === category.key"
          :disabled="!samplesByCategory[category.key]?.length"
          :class="{ 'is-active': activeCategory === category.key }"
          @click="chooseCategory(category.key)"
        >
          <span class="playground-category-name">
            <span class="playground-category-icon" aria-hidden="true">
              <StateChangeIcon :category="category.key" />
            </span>
            <span>{{ category.label }}</span>
          </span>
          <span class="playground-category-count">{{ samplesByCategory[category.key]?.length ?? 0 }}</span>
        </button>
      </div>
      <div class="playground-example-list" :aria-label="`${activeCategory} examples`">
        <button
          v-for="sample in activeSamples"
          :key="sample.key"
          type="button"
          :data-scenario="sample.key"
          :aria-pressed="selected === sample.key"
          :class="{ 'is-active': selected === sample.key }"
          @click="selected = sample.key"
        >{{ sampleLabel(sample.label) }}</button>
      </div>
    </nav>
    <DataCodeChart
      id="lab-workspace"
      :rows="tableRows"
      :data-status="tableStatus"
      data-title="Data at nearest authored state"
      code-title="Two immutable states"
      chart-title="Transition frame"
    >
      <template #code-status>
        <span :id="isLabMode ? 'status' : undefined" class="playground-status" :data-kind="statusKind">{{ status }}</span>
      </template>
      <template #code>
      <div class="playground-editor-pane">
        <div class="playground-toolbar">
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
        </div>
        <div class="playground-code-cells">
          <label class="playground-code-cell">
            <span>From</span>
            <EditableCodeCell
              v-model="fromCode"
              :editor-id="isLabMode ? 'editor' : undefined"
              aria-label="Editable VisDelta code"
              @run="runCode"
            />
          </label>
          <label class="playground-code-cell">
            <span>To</span>
            <EditableCodeCell
              v-model="toCode"
              :editor-id="isLabMode ? 'to-editor' : undefined"
              aria-label="Editable VisDelta to state code"
              @run="runCode"
            />
          </label>
        </div>
        <p v-if="isLabMode" class="playground-contract"><code>{{ labChart }}</code>, <code>d3</code>, and the same loaded <code>rows</code> are provided to both cells. From and To execute independently and do not share declarations.</p>
        <p v-else class="playground-contract">From and To execute independently with the same supplied data. Categories describe the difference, not playback order.</p>
      </div>
      </template>

      <template #chart-status>
        <output>progress {{ progress.toFixed(2) }}</output>
      </template>
      <template #chart>
      <div class="playground-output-pane">
        <output v-if="isLabMode" id="value" class="playground-progress-value">{{ progress.toFixed(2) }}</output>
        <div v-if="lineTransition" class="playground-line-plan">Line transition <strong>{{ lineTransition }}</strong></div>
        <div class="playground-chart-stage" :class="{ 'is-error': error }">
          <div
            :id="isLabMode ? 'chart' : undefined"
            ref="chartTarget"
            class="playground-chart"
            aria-label="Editable syntax output"
            :aria-hidden="error ? 'true' : undefined"
          ></div>
          <div v-if="error" class="playground-runtime-error" role="alert">
            <strong>Code error</strong>
            <span>{{ error }}</span>
          </div>
        </div>
        <p v-if="description" class="playground-description">{{ description }}</p>
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
          <summary>Inspect computed state difference</summary>
          <DocsCodeBlock :code="deltaText" language="json" />
        </details>
      </div>
      </template>
    </DataCodeChart>
  </div>
</template>
