<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const rows = [
  { year: 2004, country: 'Norway', sites: 5 },
  { year: 2004, country: 'Denmark', sites: 4 },
  { year: 2004, country: 'Sweden', sites: 13 },
  { year: 2022, country: 'Norway', sites: 8 },
  { year: 2022, country: 'Denmark', sites: 10 },
  { year: 2022, country: 'Sweden', sites: 15 }
];

const chartTypes = [
  {
    key: 'bar',
    label: 'Bar',
    base: [
      'const chart = bar(rows)',
      '  .x("year")',
      '  .y("sites")',
      '  .breakdown("country")'
    ],
    operations: [
      { line: '.color("country")', label: '.color()' },
      { line: '.layout("grouped")', label: '.layout()' },
      { line: '.flip()', label: '.flip()' }
    ]
  },
  {
    key: 'line',
    label: 'Line',
    base: [
      'const chart = line(rows)',
      '  .x("year")',
      '  .y("sites")',
      '  .breakdown("country")'
    ],
    operations: [
      { line: '.color("country")', label: '.color()' },
      { line: '.curve("curveBumpX")', label: '.curve()' },
      { line: '.flip()', label: '.flip()' }
    ]
  },
  {
    key: 'area',
    label: 'Area',
    base: [
      'const chart = area(rows)',
      '  .x("year")',
      '  .y("sites")',
      '  .breakdown("country")'
    ],
    operations: [
      { line: '.color("country")', label: '.color()' },
      { line: '.layout("stream")', label: '.layout()' },
      { line: '.curve("curveBumpX")', label: '.curve()' }
    ]
  },
  {
    key: 'point',
    label: 'Point',
    base: [
      'const chart = point(rows)',
      '  .x("sites")',
      '  .y("country")',
      '  .key(["year", "country"])'
    ],
    operations: [
      { line: '.color("country")', label: '.color()' },
      { line: '.connector({ by: "country", orderBy: "year" })', label: '.connector()' },
      { line: '.flip()', label: '.flip()' }
    ]
  },
  {
    key: 'unit',
    label: 'Unit',
    base: [
      'const chart = unit(rows)',
      '  .x("year")',
      '  .key(["year", "country"])',
      '  .value("sites", { unitValue: 2 })'
    ],
    operations: [
      { line: '.group("country")', label: '.group()' },
      { line: '.color("country")', label: '.color()' },
      { line: '.layout("force")', label: '.layout()' }
    ]
  }
];

const target = ref(null);
const selectedType = ref('bar');
const code = ref(sourceFor('bar', 0));
const changedLine = ref(-1);
const status = ref('Rendering Bar');

const AUTO_START_DELAY = 1400;
const AUTO_LINE_HOLD = 1300;
const AUTO_STEP_GAP = 1200;

let chartFactories = null;
let createTransition = null;
let controller = null;
let resizeObserver = null;
let timer = null;
let commitFrame = null;
let currentStep = 0;
let direction = 1;
let renderVersion = 0;
let reducedMotion = false;
let destroyed = false;

onMounted(async () => {
  try {
    const [
      barModule,
      lineModule,
      areaModule,
      pointModule,
      unitModule,
      transitionModule
    ] = await Promise.all([
      import('../../../dist/bar.js'),
      import('../../../dist/line.js'),
      import('../../../dist/area.js'),
      import('../../../dist/point.js'),
      import('../../../dist/unit.js'),
      import('../../../dist/transition-entry.js')
    ]);
    chartFactories = {
      bar: barModule.bar,
      line: lineModule.line,
      area: areaModule.area,
      point: pointModule.point,
      unit: unitModule.unit
    };
    createTransition = transitionModule.transition;
    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    resizeObserver = new ResizeObserver(() => controller?.resize());
    resizeObserver.observe(target.value);
    await selectChart('bar');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Unable to load the transition';
  }
});

onBeforeUnmount(() => {
  destroyed = true;
  renderVersion += 1;
  window.clearTimeout(timer);
  window.cancelAnimationFrame(commitFrame);
  resizeObserver?.disconnect();
  controller?.destroy();
});

function configFor(type) {
  return chartTypes.find((chart) => chart.key === type) ?? chartTypes[0];
}

function sourceFor(type, index) {
  const config = configFor(type);
  const lines = [
    ...config.base,
    ...config.operations.slice(0, index).map(({ line }) => `  ${line}`)
  ];
  lines[lines.length - 1] += ';';
  return lines.join('\n');
}

function evaluate(source) {
  const run = new Function(
    'bar',
    'line',
    'area',
    'point',
    'unit',
    'rows',
    `"use strict";\n${source}\nreturn chart;`
  );
  return run(
    chartFactories.bar,
    chartFactories.line,
    chartFactories.area,
    chartFactories.point,
    chartFactories.unit,
    structuredClone(rows)
  );
}

async function prepareCode(nextCode, version) {
  if (!target.value || destroyed) return null;
  const nextState = evaluate(nextCode);
  const nextSpec = nextState.toSpec();
  const candidate = document.createElement('div');
  candidate.className = 'hero-demo-candidate';
  target.value.append(candidate);
  let next;
  try {
    const fromState = controller?.to?.mark === nextSpec.mark ? controller.to : nextState;
    next = await createTransition(fromState, nextState, {
      target: candidate,
      height: window.innerWidth < 620 ? 280 : 340
    });
    if (destroyed || version !== renderVersion) {
      next.destroy();
      candidate.remove();
      return null;
    }
    next.progress(0);
    return { candidate, next };
  } catch (error) {
    next?.destroy();
    candidate.remove();
    if (version === renderVersion) {
      status.value = error instanceof Error ? error.message : 'Unable to render the transition';
    }
    return null;
  }
}

async function commitCode(nextCode, nextStep, chartKey, { animate = true, operation = null } = {}) {
  const version = ++renderVersion;
  const prepared = await prepareCode(nextCode, version);
  if (!prepared || destroyed || version !== renderVersion) return false;

  return new Promise((resolve) => {
    commitFrame = window.requestAnimationFrame(async () => {
      commitFrame = null;
      if (destroyed || version !== renderVersion || !target.value) {
        prepared.next.destroy();
        prepared.candidate.remove();
        resolve(false);
        return;
      }

      const publishCode = async () => {
        code.value = nextCode;
        selectedType.value = chartKey;
        currentStep = nextStep;
        status.value = operation
          ? `${operation.direction === 'add' ? 'Adding' : 'Removing'} ${operation.label}`
          : `${configFor(chartKey).label} code and chart are linked`;
        changedLine.value = operation?.direction === 'add'
          ? nextCode.split('\n').findIndex((line) => line.includes(operation.line))
          : -1;
        await nextTick();
      };

      await publishCode();
      if (destroyed || version !== renderVersion || !target.value) {
        prepared.next.destroy();
        prepared.candidate.remove();
        resolve(false);
        return;
      }

      target.value.replaceChildren(...prepared.candidate.childNodes);
      controller?.destroy();
      controller = prepared.next;

      if (!animate) {
        controller.progress(1);
        resolve(true);
        return;
      }

      const initialProgress = 0.1;
      controller.progress(initialProgress);
      controller.play({ from: initialProgress, to: 1, duration: 950 });
      resolve(true);
    });
  });
}

async function selectChart(type) {
  if (!chartFactories || destroyed) return;
  window.clearTimeout(timer);
  renderVersion += 1;
  const nextCode = sourceFor(type, 0);
  selectedType.value = type;
  // Selecting a chart type changes the declaration immediately. Rendering the
  // corresponding chart can remain asynchronous without leaving the selected
  // tab paired with the previous chart's source code.
  code.value = nextCode;
  currentStep = 0;
  direction = 1;
  changedLine.value = -1;
  status.value = `Rendering ${configFor(type).label}`;
  const committed = await commitCode(nextCode, 0, type, { animate: false });
  if (!committed || destroyed) return;
  if (!reducedMotion) timer = window.setTimeout(advance, AUTO_START_DELAY);
}

async function advance() {
  if (destroyed) return;
  const config = configFor(selectedType.value);
  let nextStep = currentStep + direction;
  if (nextStep > config.operations.length || nextStep < 0) {
    direction *= -1;
    nextStep = currentStep + direction;
  }

  const operationIndex = direction > 0 ? nextStep - 1 : currentStep - 1;
  const operation = config.operations[operationIndex];
  const committed = await commitCode(sourceFor(config.key, nextStep), nextStep, config.key, {
    operation: {
      ...operation,
      direction: direction > 0 ? 'add' : 'remove'
    }
  });
  if (!committed || destroyed) return;

  timer = window.setTimeout(() => {
    changedLine.value = -1;
    status.value = `${config.label} code and chart are linked`;
    timer = window.setTimeout(advance, AUTO_STEP_GAP);
  }, AUTO_LINE_HOLD);
}
</script>

<template>
  <div class="hero-demo-experience">
    <header class="hero-title-panel">
      <div class="hero-title-copy">
        <p class="product-kicker">Declarative chart animation</p>
        <h1>Chart change,<br>animated.</h1>
      </div>
      <div class="hero-title-actions">
        <p class="product-hero-lead">Change the code. VisDelta turns the difference into a seekable transition.</p>
        <p class="hero-install-command" aria-label="Install VisDelta with npm"><span aria-hidden="true">$</span><code>npm install visdelta</code></p>
        <div class="product-hero-actions">
          <a class="product-primary-action" href="./getting-started.html">Get started</a>
      <a href="./language-framework.html#run-a-state-difference">Run a difference</a>
        </div>
      </div>
    </header>

    <div class="hero-pipeline" aria-label="Data to code to animated chart">
      <section class="hero-data-panel hero-flow-data" aria-label="Source data">
        <div class="hero-data-table-shell">
          <header>
            <strong>rows</strong>
            <span>{{ rows.length }} source records</span>
          </header>
          <table>
            <thead>
              <tr><th>year</th><th>country</th><th>sites</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="`${row.year}-${row.country}`">
                <td>{{ row.year }}</td><td>{{ row.country }}</td><td>{{ row.sites }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <span class="hero-flow-arrow hero-flow-arrow-data" aria-hidden="true"></span>

      <section class="hero-demo-code hero-flow-code" aria-label="Changing VisDelta chart code">
        <div class="hero-demo-code-title">
          <span>state.js</span>
          <b>Auto editing</b>
        </div>
        <DocsCodeBlock
          embedded
          :code="code"
          language="js"
          :highlighted-line="changedLine"
        />
      </section>

      <span class="hero-flow-arrow hero-flow-arrow-code" aria-hidden="true"></span>

      <section class="hero-demo hero-flow-chart" aria-label="Automatically animated VisDelta chart example">
        <header class="hero-demo-head">
          <span class="hero-demo-live">Live</span>
          <div class="hero-chart-tabs" role="tablist" aria-label="Chart type">
            <button
              v-for="chart in chartTypes"
              :key="chart.key"
              type="button"
              role="tab"
              :aria-selected="selectedType === chart.key"
              :class="{ 'is-active': selectedType === chart.key }"
              @click="selectChart(chart.key)"
            >{{ chart.label }}</button>
          </div>
          <strong>{{ status }}</strong>
        </header>

        <div ref="target" class="hero-demo-chart" aria-label="Chart driven by the code"></div>
      </section>
    </div>
  </div>
</template>
