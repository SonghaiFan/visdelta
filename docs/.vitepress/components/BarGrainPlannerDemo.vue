<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const target = ref(null);
const status = ref('Loading Bar Grain route');
const error = ref('');
const progress = ref(0);
const planText = ref('Waiting for the Bar declaration planner…');
const fromCode = ref('');
const toCode = ref('');
const stageCount = ref(0);
let change = null;
let resizeObserver = null;
let animationFrame = 0;
let disposed = false;

const stageLabel = computed(() => stageCount.value === 1
  ? '1 complete stage'
  : `${stageCount.value} complete stages`);

onMounted(async () => {
  try {
    const [{ bar, createBarGrainDeclarationOperationCodec }, { planDeclarationTransition }, { transition }] = await Promise.all([
      import('../../../dist/bar.js'),
      import('../../../dist/index.js'),
      import('../../../dist/transition-entry.js')
    ]);
    if (disposed) return;
    const rows = [
      { state: 'California', age: 'Under 18', population: 8.8 },
      { state: 'California', age: '18–64', population: 25.4 },
      { state: 'California', age: '65+', population: 5.8 },
      { state: 'Texas', age: 'Under 18', population: 5.7 },
      { state: 'Texas', age: '18–64', population: 14.8 },
      { state: 'Texas', age: '65+', population: 3.6 },
      { state: 'Florida', age: 'Under 18', population: 4.2 },
      { state: 'Florida', age: '18–64', population: 14.2 },
      { state: 'Florida', age: '65+', population: 5.1 }
    ];
    const from = bar(rows).x('state', { title: 'State' }).y('population', { title: 'People (millions)' })
      .rollup({ title: 'People (millions)' });
    const to = bar(rows).x('state', { title: 'State' }).y('population', { title: 'People (millions)' })
      .breakdown('age', { title: 'People (millions)' }).layout('grouped').color('#3366ff');
    const plan = planDeclarationTransition(from.toSpec(), to.toSpec(), createBarGrainDeclarationOperationCodec());
    if (plan.status !== 'planned') throw new Error(`Bar Grain route unavailable: ${plan.reason}`);
    stageCount.value = plan.stages.length;
    fromCode.value = "const from = bar(data).x('state', { title: 'State' })\n  .y('population', { title: 'People (millions)' })\n  .rollup({ title: 'People (millions)' });";
    toCode.value = "const to = bar(data).x('state', { title: 'State' })\n  .y('population', { title: 'People (millions)' })\n  .breakdown('age', { title: 'People (millions)' })\n  .layout('grouped')\n  .color('#3366ff');";
    planText.value = JSON.stringify({
      status: plan.status,
      stages: plan.stages.map(stage => ({
        operation: stage.operation.id,
        completeState: stage.to
      }))
    }, null, 2);

    await nextTick();
    if (disposed) return;
    const candidate = await transition(from, to, { target: target.value, height: 320 });
    if (disposed) {
      candidate.destroy();
      return;
    }
    change = candidate;
    change.progress(0);
    resizeObserver = new ResizeObserver(() => change?.resize());
    resizeObserver.observe(target.value);
    status.value = 'Ready';
  } catch (cause) {
    if (disposed) return;
    error.value = cause instanceof Error ? cause.message : 'Unable to initialize the Bar Grain example.';
    status.value = 'Error';
  }
});

onBeforeUnmount(() => {
  disposed = true;
  change?.pause();
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  change?.destroy();
});

function stopPlayback() {
  change?.pause();
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
}

function seek(value) {
  if (!change) return;
  stopPlayback();
  change.progress(value);
  progress.value = value;
  status.value = 'Ready';
}

function play(to) {
  if (!change) return;
  stopPlayback();
  change.play({ from: change.value, to, duration: 900 });
  status.value = to > change.value ? 'Playing route' : 'Playing reverse';
  const reflect = () => {
    progress.value = change.value;
    if (Math.abs(change.value - to) > 0.0001) animationFrame = requestAnimationFrame(reflect);
    else { animationFrame = 0; status.value = 'Ready'; }
  };
  animationFrame = requestAnimationFrame(reflect);
}
</script>

<template>
  <section class="bar-grain-demo" aria-label="Live Bar Grain transition">
    <div class="bar-grain-demo-chart-panel">
      <div class="bar-grain-demo-heading">
        <div><span>Live runtime · {{ status }}</span><strong>Total → grouped detail + color</strong></div>
        <output>{{ progress.toFixed(2) }}</output>
      </div>
      <p class="bar-grain-demo-note">Illustrative population values for demonstration only.</p>
      <div ref="target" class="bar-grain-demo-chart" aria-label="Animated population Bar chart"></div>
      <div v-if="error" class="bar-grain-demo-error" role="alert">{{ error }}</div>
      <div class="bar-grain-demo-controls">
        <button type="button" :disabled="status === 'Loading Bar Grain route' || status === 'Error'" @click="play(1)">Play route →</button>
        <input
          type="range" min="0" max="1" step="0.01" :value="progress"
          aria-label="Bar Grain transition progress"
          :disabled="status === 'Loading Bar Grain route' || status === 'Error'"
          @input="seek($event.target.valueAsNumber)"
        />
        <button type="button" :disabled="status === 'Loading Bar Grain route' || status === 'Error'" @click="play(0)">← Play reverse</button>
      </div>
    </div>
    <details class="bar-grain-demo-inspector" open>
      <summary>Planner path · {{ stageLabel }}</summary>
      <div class="bar-grain-demo-authoring">
        <section><h4>From</h4><pre><code>{{ fromCode }}</code></pre></section>
        <section><h4>To</h4><pre><code>{{ toCode }}</code></pre></section>
      </div>
      <pre><code>{{ planText }}</code></pre>
    </details>
  </section>
</template>

<style scoped>
.bar-grain-demo {
  display: grid;
  gap: 1rem;
  margin: 1.5rem 0 2rem;
}
.bar-grain-demo-chart-panel,
.bar-grain-demo-inspector {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}
.bar-grain-demo-chart-panel { padding: 1rem; }
.bar-grain-demo-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: .5rem;
}
.bar-grain-demo-heading div { display: grid; gap: .2rem; }
.bar-grain-demo-heading span { color: var(--vp-c-text-2); font-size: .78rem; }
.bar-grain-demo-heading strong { font-size: 1rem; font-weight: 600; }
.bar-grain-demo-heading output { font-variant-numeric: tabular-nums; color: var(--vp-c-text-2); }
.bar-grain-demo-note { margin: 0; color: var(--vp-c-text-2); font-size: .78rem; }
.bar-grain-demo-chart { min-height: 320px; }
.bar-grain-demo-controls { display: flex; align-items: center; gap: .75rem; }
.bar-grain-demo-controls input { flex: 1; min-width: 2rem; accent-color: var(--vp-c-brand-1); }
.bar-grain-demo-controls button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: .4rem .65rem;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.bar-grain-demo-controls button:disabled { opacity: .5; cursor: default; }
.bar-grain-demo-inspector { overflow: hidden; }
.bar-grain-demo-inspector summary { padding: .75rem 1rem; cursor: pointer; font-weight: 600; }
.bar-grain-demo-inspector pre { max-height: 27rem; overflow: auto; margin: 0; padding: 0 1rem 1rem; font-size: .72rem; line-height: 1.55; }
.bar-grain-demo-authoring { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; padding: 0 1rem 1rem; }
.bar-grain-demo-authoring section { min-width: 0; }
.bar-grain-demo-authoring h4 { margin: 0 0 .35rem; font-size: .8rem; }
.bar-grain-demo-authoring pre { max-height: none; padding: .65rem; border-radius: 6px; background: var(--vp-c-bg); white-space: pre-wrap; overflow-wrap: anywhere; }
.bar-grain-demo-error { color: var(--vp-c-danger-1); }
@media (max-width: 640px) {
  .bar-grain-demo-chart-panel { padding: .75rem; }
  .bar-grain-demo-controls { gap: .4rem; }
  .bar-grain-demo-controls button { padding: .4rem .5rem; font-size: .78rem; }
  .bar-grain-demo-authoring { grid-template-columns: minmax(0, 1fr); }
}
</style>
