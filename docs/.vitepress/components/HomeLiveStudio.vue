<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const rows = [
  { year: 2004, country: 'Norway', sites: 5 },
  { year: 2004, country: 'Denmark', sites: 4 },
  { year: 2004, country: 'Sweden', sites: 13 },
  { year: 2022, country: 'Norway', sites: 8 },
  { year: 2022, country: 'Denmark', sites: 10 },
  { year: 2022, country: 'Sweden', sites: 15 }
];

const colors = '["#195fb5", "#f28e2b", "#0fa470"]';
const chartPresets = [
  {
    type: 'bar',
    label: 'Bar',
    code: `const detail = bar(rows)
  .datumKey(["year", "country"])
  .x("year", { title: "Year" })
  .y("sites", { title: "World Heritage Sites" })
  .breakdown("country", { color: ${colors} });

let chart = detail.rollup();`
  },
  {
    type: 'line',
    label: 'Line',
    code: `const chart = line(rows)
  .datumKey(["year", "country"])
  .x("year", { title: "Year" })
  .y("sites", { title: "World Heritage Sites" })
  .key(["year", "country"])
  .breakdown("country", { color: ${colors} });`
  },
  {
    type: 'area',
    label: 'Area',
    code: `const chart = area(rows)
  .datumKey(["year", "country"])
  .x("year", { title: "Year" })
  .y("sites", { title: "World Heritage Sites" })
  .key(["year", "country"])
  .breakdown("country", { color: ${colors} });`
  },
  {
    type: 'point',
    label: 'Point',
    code: `const chart = point(rows)
  .datumKey(["year", "country"])
  .x("year", { title: "Year" })
  .y("sites", { title: "World Heritage Sites" })
  .key(["year", "country"])
  .color("country", { range: ${colors} });`
  },
  {
    type: 'unit',
    label: 'Unit',
    code: `const chart = unit(rows)
  .datumKey(["year", "country"])
  .key(["year", "country"])
  .x("year", { title: "Year" })
  .color("country", { range: ${colors} })
  .value("sites", { maxUnits: 60 })
  .layout("beeswarm");`
  }
];

const starterCode = chartPresets[0].code;
// Let people complete a thought before evaluating ordinary keystrokes. Enter
// remains deliberately quicker because it is an explicit line boundary.
const EDIT_IDLE_MS = 1200;
const LINE_COMMIT_DELAY_MS = 140;

const chartTarget = ref(null);
const editorHost = ref(null);
const code = ref(starterCode);
const status = ref('Loading runtime');
const error = ref('');
const previewIsStale = ref(false);
const eventLabel = ref('Initial state');
const transitionCount = ref(0);
const activeChartType = ref(chartPresets[0].type);
const tableRows = ref(rows);
const tableStatus = ref(`${rows.length} source rows`);
const tableColumns = computed(() => [
  ...new Set(tableRows.value.flatMap((row) => Object.keys(row)))
]);

let chartFactories = null;
let createTransition = null;
let renderedState = null;
let renderedSpec = '';
let activeTransition = null;
let resizeObserver = null;
let debounceTimer = null;
let runVersion = 0;
let destroyed = false;
let editorView = null;
let replacingEditorCode = false;

onMounted(async () => {
  try {
    const [
      barModule,
      lineModule,
      areaModule,
      pointModule,
      unitModule,
      transitionModule,
      codemirrorModule,
      javascriptModule
    ] = await Promise.all([
      import('../../../dist/bar.js'),
      import('../../../dist/line.js'),
      import('../../../dist/area.js'),
      import('../../../dist/point.js'),
      import('../../../dist/unit.js'),
      import('../../../dist/transition-entry.js'),
      import('codemirror'),
      import('@codemirror/lang-javascript')
    ]);
    const { basicSetup, EditorView } = codemirrorModule;
    const { javascript } = javascriptModule;
    chartFactories = {
      bar: barModule.bar,
      line: lineModule.line,
      area: areaModule.area,
      point: pointModule.point,
      unit: unitModule.unit
    };
    editorView = new EditorView({
      doc: code.value,
      parent: editorHost.value,
      extensions: [
        basicSetup,
        javascript(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': 'Editable VisDelta chart code',
          'aria-multiline': 'true'
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || replacingEditorCode) return;
          code.value = update.state.doc.toString();
          const lineCommitted = update.transactions.some(transactionAddsLineBreak);
          onInput(
            lineCommitted ? 'Line committed' : 'Code changed',
            lineCommitted ? LINE_COMMIT_DELAY_MS : EDIT_IDLE_MS
          );
        }),
        EditorView.domEventHandlers({
          keydown(event) {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              renderCode('Code committed');
              return true;
            }
            return false;
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            backgroundColor: 'transparent',
            color: 'var(--vp-c-text-1)',
            fontSize: '12px'
          },
          '&.cm-focused': { outline: 'none' },
          '.cm-scroller': {
            fontFamily: 'var(--vp-font-family-mono)',
            lineHeight: '1.65'
          },
          '.cm-content': { padding: '18px 0' },
          '.cm-line': { padding: '0 18px' },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            color: 'var(--vp-c-text-3)',
            borderRight: '1px solid var(--vp-c-divider)'
          },
          '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 8px' },
          '.cm-activeLine, .cm-activeLineGutter': {
            backgroundColor: 'color-mix(in srgb, var(--vp-c-brand-1) 7%, transparent)'
          },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--vp-c-brand-1)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: 'color-mix(in srgb, var(--vp-c-brand-1) 20%, transparent)'
          }
        })
      ]
    });
    createTransition = transitionModule.transition;
    resizeObserver = new ResizeObserver(() => activeTransition?.resize());
    resizeObserver.observe(chartTarget.value);
    await renderCode('Initial state', false);
  } catch (cause) {
    showError(cause);
  }
});

onBeforeUnmount(() => {
  destroyed = true;
  window.clearTimeout(debounceTimer);
  resizeObserver?.disconnect();
  activeTransition?.destroy();
  editorView?.destroy();
});

function transactionAddsLineBreak(transaction) {
  let addsLineBreak = false;
  transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.toString().includes('\n')) addsLineBreak = true;
  });
  return addsLineBreak;
}

function onInput(reason = 'Code changed', delay = EDIT_IDLE_MS) {
  // A typed character makes every in-flight candidate stale immediately.
  // This prevents an error from a partially edited string being shown beside
  // a newer, already-correct line of code.
  runVersion += 1;
  error.value = '';
  // A debounce or an ordinary chart transition is not an error state. Keep the
  // committed visualization clear until this version actually fails to render.
  previewIsStale.value = false;
  status.value = reason === 'Line committed' ? 'Running completed line' : 'Editing';
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => renderCode(reason), delay);
}

function replaceEditorCode(nextCode) {
  code.value = nextCode;
  if (!editorView) return;
  replacingEditorCode = true;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: nextCode },
    selection: { anchor: nextCode.length },
    scrollIntoView: true
  });
  replacingEditorCode = false;
  editorView.focus();
}

async function selectChartType(preset) {
  replaceEditorCode(preset.code);
  await nextTick();
  await renderCode(`${preset.label} setup`, false);
}

async function reset() {
  const preset = chartPresets.find(({ type }) => type === activeChartType.value) ?? chartPresets[0];
  replaceEditorCode(preset.code);
  await nextTick();
  await renderCode('Reset');
}

async function evaluate(source) {
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  const run = new AsyncFunction(
    'bar', 'line', 'area', 'point', 'unit',
    'rows',
    `"use strict";\n${source}\nif (typeof chart === "undefined") throw new Error("Define chart before the final line.");\nreturn chart;`
  );
  const next = await run(
    chartFactories.bar,
    chartFactories.line,
    chartFactories.area,
    chartFactories.point,
    chartFactories.unit,
    structuredClone(rows)
  );
  if (!next || typeof next.toSpec !== 'function') {
    throw new Error('The code must leave a VisDelta chart in `chart`.');
  }
  return next;
}

async function renderCode(reason, animate = true) {
  if (!chartFactories || !createTransition || !chartTarget.value || destroyed) return;
  window.clearTimeout(debounceTimer);
  const version = ++runVersion;
  status.value = 'Reading code';
  error.value = '';

  let nextState;
  try {
    nextState = await evaluate(code.value);
  } catch (cause) {
    if (version === runVersion) showError(cause);
    return;
  }

  const compiledNextSpec = nextState.toSpec();
  if (version !== runVersion) return;
  materializeTable(nextState, compiledNextSpec.transform?.length ?? 0);
  const nextSpec = JSON.stringify(compiledNextSpec);
  if (nextSpec === renderedSpec) {
    previewIsStale.value = false;
    status.value = 'Ready, no visual change';
    eventLabel.value = reason;
    return;
  }

  const host = chartTarget.value;
  const candidate = document.createElement('div');
  candidate.className = 'home-studio-candidate';
  host.append(candidate);
  let nextTransition = null;

  try {
    activeTransition?.progress(1);
    const sameChartType = !renderedState || renderedState.toSpec().mark === compiledNextSpec.mark;
    nextTransition = await createTransition(sameChartType ? (renderedState || nextState) : nextState, nextState, {
      target: candidate,
      height: window.innerWidth < 768 ? 320 : 430
    });
    nextTransition.progress(1);
    const renderError = renderedError(candidate);
    if (renderError) throw new Error(renderError);
    if (destroyed || version !== runVersion) {
      nextTransition.destroy();
      candidate.remove();
      return;
    }

    if (animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      nextTransition.progress(0);
    }

    host.replaceChildren(...candidate.childNodes);
    activeTransition?.destroy();
    activeTransition = nextTransition;
    renderedState = nextState;
    renderedSpec = nextSpec;
    activeChartType.value = compiledNextSpec.mark;
    eventLabel.value = reason;
    if (animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      transitionCount.value += 1;
      activeTransition.play({ duration: 760 });
    } else {
      activeTransition.progress(1);
    }
    status.value = 'Ready';
    previewIsStale.value = false;
  } catch (cause) {
    nextTransition?.destroy();
    candidate.remove();
    if (version === runVersion) showError(cause);
  }
}

function showError(cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  error.value = message;
  previewIsStale.value = true;
  status.value = 'Fix the current line';
  eventLabel.value = 'No output';
}

function materializeTable(state, transformCount) {
  try {
    const nextRows = state.rows();
    tableRows.value = nextRows;
    tableStatus.value = transformCount
      ? `${nextRows.length} rows after ${transformCount} transform${transformCount === 1 ? '' : 's'}`
      : `${nextRows.length} source rows`;
  } catch {
    tableRows.value = [];
    tableStatus.value = 'No rows at current state';
  }
}

function displayValue(value) {
  return value == null ? '∅' : String(value);
}

function renderedError(candidate) {
  return [...candidate.querySelectorAll('.vd-empty')]
    .find((node) => node.style.display !== 'none' && node.textContent?.trim())
    ?.textContent?.trim() ?? '';
}
</script>

<template>
  <section id="studio" class="home-studio" :data-transition-count="transitionCount">
    <header class="home-studio-intro">
      <h2>Write a state. Watch the chart move.</h2>
      <p>Finish a line or choose a chart type. The editor runs completed code, then turns each valid change into a real VisDelta transition.</p>
    </header>

    <div class="home-studio-shell">
      <section class="home-studio-data" aria-labelledby="home-studio-data-title">
        <header class="home-studio-pane-head">
          <span id="home-studio-data-title">Data at current state</span>
          <strong>{{ tableStatus }}</strong>
        </header>
        <div class="home-studio-table-wrap">
          <table v-if="tableRows.length" class="home-studio-table">
            <thead>
              <tr>
                <th v-for="column in tableColumns" :key="column" scope="col">{{ column }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in tableRows" :key="index">
                <td v-for="column in tableColumns" :key="column">{{ displayValue(row[column]) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="home-studio-empty-data">No materialized rows for this state.</p>
        </div>
      </section>

      <div class="home-studio-output-pane">
        <header class="home-studio-pane-head">
          <span>Visualization</span>
          <strong>{{ eventLabel }}</strong>
        </header>
        <div
          ref="chartTarget"
          class="home-studio-chart"
          :class="{ 'is-stale': previewIsStale }"
          aria-label="Live VisDelta chart output"
        ></div>
        <div v-if="error" class="home-studio-visual-error" role="status">
          <strong>Cannot render current state</strong>
          <span>Showing the previous valid visualization. Fix the code to update it.</span>
        </div>
      </div>

      <div class="home-studio-editor-pane">
        <header class="home-studio-pane-head">
          <span>state.js</span>
          <span class="home-studio-status" aria-live="polite">{{ status }}</span>
        </header>
        <div class="home-studio-operations" aria-label="Chart type starter code">
          <button
            v-for="preset in chartPresets"
            :key="preset.type"
            type="button"
            :class="{ 'is-active': activeChartType === preset.type }"
            :aria-pressed="activeChartType === preset.type"
            @click="selectChartType(preset)"
          >
            {{ preset.label }}
          </button>
          <button type="button" @click="reset">Reset</button>
        </div>
        <div ref="editorHost" class="home-code-field"></div>
        <p v-if="error" class="home-studio-error" role="alert">{{ error }}</p>
      </div>
    </div>
  </section>
</template>
