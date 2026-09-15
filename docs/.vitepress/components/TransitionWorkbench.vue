<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const target = ref(null);
const status = ref('Loading');
const error = ref('');
const progress = ref(0);
const activePanel = ref('code');
const deltaText = ref('Waiting for runtime...');
const specText = ref('Waiting for runtime...');
const sequenceIndex = ref(0);
const sequenceCaption = ref('Revenue by category.');

let change = null;
let resizeObserver = null;
let themeObserver = null;
let watchFrame = 0;

const codeText = `const base = bar(rows)
  .x("category")
  .y("sales")
  .key("category");

const profit = base.y("profit");

const change = await transition(
  base,
  profit,
  { target: "#chart" }
);

change.progress(0.42);
change.play({ from: 1, to: 0 });`;

const inspectorText = computed(() => {
  if (activePanel.value === 'delta') return deltaText.value;
  if (activePanel.value === 'spec') return specText.value;
  return codeText;
});

const sequencePosition = computed(() => `${sequenceIndex.value + 1} / 3`);
const sequenceCaptions = [
  'Revenue by category.',
  'A seekable frame halfway through the same delta.',
  'Profit by category.'
];

onMounted(async () => {
  try {
    const [{ bar }, { transition }] = await Promise.all([
      import('../../../dist/bar.js'),
      import('../../../dist/transition-entry.js')
    ]);

    const rows = [
      { category: 'Hardware', sales: 86, profit: 34 },
      { category: 'Software', sales: 64, profit: 49 },
      { category: 'Services', sales: 51, profit: 27 },
      { category: 'Support', sales: 39, profit: 18 }
    ];

    const base = bar(rows)
      .x('category', { title: 'Category' })
      .y('sales', { title: 'Revenue' })
      .key('category')
      .color('#1c6ae4')
      .tooltip(['category', 'sales'])
      .transition({ duration: 720, ease: 'cubicInOut' });

    const profitState = base
      .y('profit', { title: 'Profit' })
      .color('#03a86c')
      .tooltip(['category', 'profit']);

    await nextTick();
    change = await transition(base, profitState, {
      target: target.value,
      height: 270
    });

    deltaText.value = JSON.stringify({
      changed: change.delta.changed,
      deltas: change.delta.deltas,
      semantic: {
        previous: change.delta.semantic.previous,
        next: change.delta.semantic.next,
        deltas: change.delta.semantic.deltas
      }
    }, null, 2);
    specText.value = JSON.stringify({ from: change.from, to: change.to }, null, 2);

    moveSequence(0);

    resizeObserver = new ResizeObserver(() => change?.resize());
    resizeObserver.observe(target.value);
    themeObserver = new MutationObserver(() => change?.resize());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    status.value = 'Ready';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to initialize the live transition.';
    status.value = 'Error';
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(watchFrame);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  change?.destroy();
});

function setProgress(value) {
  const next = Math.max(0, Math.min(1, Number(value) || 0));
  progress.value = next;
  change?.progress(next);
}

function play(to) {
  if (!change) return;
  change.play({ duration: 900, from: change.value, to });
  cancelAnimationFrame(watchFrame);
  let stable = 0;
  let previous = -1;
  const watch = () => {
    progress.value = change.value;
    stable = Math.abs(previous - change.value) < 0.0001 ? stable + 1 : 0;
    previous = change.value;
    if (stable < 4) watchFrame = requestAnimationFrame(watch);
  };
  watchFrame = requestAnimationFrame(watch);
}

function pause() {
  change?.pause();
  cancelAnimationFrame(watchFrame);
  if (change) progress.value = change.value;
}

function moveSequence(direction) {
  const next = direction === 0
    ? 0
    : Math.max(0, Math.min(2, sequenceIndex.value + direction));
  sequenceIndex.value = next;
  sequenceCaption.value = sequenceCaptions[next];
  setProgress(next / 2);
}
</script>

<template>
  <div class="transition-workbench">
    <div class="workbench-main">
      <div class="workbench-visual">
        <div ref="target" class="workbench-chart" aria-label="Seekable revenue to profit bar transition"></div>
        <div v-if="error" class="workbench-error" role="alert">{{ error }}</div>
        <div class="workbench-readout">
          <span>progress</span>
          <output>{{ progress.toFixed(2) }}</output>
        </div>
        <input
          class="workbench-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="progress"
          :disabled="status !== 'Ready'"
          aria-label="Transition progress"
          @input="setProgress($event.target.valueAsNumber)"
        />
        <div class="workbench-actions">
          <button type="button" :disabled="status !== 'Ready'" @click="play(1)">Play</button>
          <button type="button" :disabled="status !== 'Ready'" @click="play(0)">Reverse</button>
          <button type="button" :disabled="status !== 'Ready'" @click="pause">Pause</button>
          <button type="button" :disabled="status !== 'Ready'" @click="setProgress(0)">Reset</button>
        </div>
      </div>

      <div class="workbench-copy">
        <p class="workbench-kicker">Live runtime: {{ status }}</p>
        <h3>Revenue to profit</h3>
        <p>The slider, buttons, inspector, and state cursor all drive the real transition package from this checkout.</p>
        <div class="workbench-tabs" role="tablist" aria-label="Runtime inspector">
          <button v-for="panel in ['code', 'delta', 'spec']" :key="panel" type="button" role="tab" :aria-selected="activePanel === panel" :class="{ 'is-active': activePanel === panel }" @click="activePanel = panel">{{ panel[0].toUpperCase() + panel.slice(1) }}</button>
        </div>
        <pre class="workbench-inspector"><code>{{ inspectorText }}</code></pre>
      </div>
    </div>

    <div class="workbench-seq">
      <div class="workbench-seq-head">
        <strong>Application state as a driver</strong>
        <output>{{ sequencePosition }}</output>
      </div>
      <p>{{ sequenceCaption }}</p>
      <div class="workbench-seq-actions">
        <button type="button" :disabled="status !== 'Ready' || sequenceIndex === 0" @click="moveSequence(-1)">Previous state</button>
        <button type="button" :disabled="status !== 'Ready' || sequenceIndex === 2" @click="moveSequence(1)">Next state</button>
      </div>
    </div>
  </div>
</template>
