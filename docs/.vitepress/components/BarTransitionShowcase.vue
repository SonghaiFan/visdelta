<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  variant: { type: String, default: 'showcase' }
});

const target = ref(null);
const running = ref(true);
const status = ref('Preparing demo');
const currentLabel = ref('Revenue by category');
const nextLabel = ref('Profit by category');

const rows = [
  { id: 'hardware', category: 'Hardware', sales: 86, profit: 34, region: 'Core' },
  { id: 'software', category: 'Software', sales: 64, profit: 49, region: 'Core' },
  { id: 'services', category: 'Services', sales: 51, profit: 27, region: 'Growth' },
  { id: 'support', category: 'Support', sales: 39, profit: 18, region: 'Growth' },
  { id: 'partners', category: 'Partners', sales: 28, profit: 14, region: 'New' }
];

let transition = null;
let createTransition = null;
let current = 0;
let states = [];
let timeout = null;
let resizeObserver = null;
let destroyed = false;
let stagingHost = null;

onMounted(async () => {
  try {
    const [{ bar }, transitionModule] = await Promise.all([
      import('../../../dist/bar.js'),
      import('../../../dist/transition-entry.js')
    ]);
    createTransition = transitionModule.transition;

    const base = bar(rows)
      .datumKey('id')
      .x('category', { title: 'Category' })
      .key('category')
      .tooltip(['category', 'sales', 'profit']);

    states = [
      { label: 'Revenue by category', chart: base.y('sales', { title: 'Revenue' }).color('#195fb5') },
      { label: 'Revenue regrouped by region', chart: bar(rows).datumKey('id').x('region', { title: 'Region' }).y('sales', { title: 'Revenue' }).rollup('region').color('#7656d6') },
      { label: 'Profit by category', chart: base.y('profit', { title: 'Profit' }).color('#0fa470') },
      { label: 'Revenue, ranked', chart: base.y('sales', { title: 'Revenue' }).color('#195fb5').sort('sales', 'descending') },
      { label: 'Growth categories', chart: base.y('sales', { title: 'Revenue' }).color('#f57c2f').where({ region: 'Growth' }) },
      { label: 'Core categories highlighted', chart: base.y('sales', { title: 'Revenue' }).color('#195fb5').highlight({ region: 'Core' }) },
      { label: 'Revenue, horizontal', chart: base.y('sales', { title: 'Revenue' }).color('#195fb5').flip() }
    ];

    await nextTick();
    resizeObserver = new ResizeObserver(() => {
      const active = transition;
      if (active) active.resize();
    });
    resizeObserver.observe(target.value);
    status.value = 'Auto-playing live transition';
    await moveTo(0, 1, false);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      running.value = false;
      status.value = 'Motion paused by system preference';
    } else {
      queueNext();
    }
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Unable to load the live demo.';
    running.value = false;
  }
});

onBeforeUnmount(() => {
  destroyed = true;
  window.clearTimeout(timeout);
  resizeObserver?.disconnect();
  stagingHost?.remove();
  transition?.destroy();
});

function chooseNext() {
  const candidates = states.map((_, index) => index).filter((index) => index !== current);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function queueNext(delay = 1000) {
  window.clearTimeout(timeout);
  if (!running.value || destroyed) return;
  const next = chooseNext();
  nextLabel.value = states[next].label;
  timeout = window.setTimeout(async () => {
    await moveTo(current, next, true);
    queueNext(2350);
  }, delay);
}


async function moveTo(fromIndex, toIndex, animate) {
  if (destroyed || !states.length || !createTransition) return;
  const previous = transition;
  const host = target.value;
  const candidate = document.createElement('div');
  candidate.className = 'transition-showcase-candidate';
  host.append(candidate);
  stagingHost = candidate;

  let next;
  try {
    next = await createTransition(states[fromIndex].chart, states[toIndex].chart, {
      target: candidate,
      height: 300
    });
    if (destroyed) {
      next.destroy();
      candidate.remove();
      return;
    }
    // Build the next B → C surface off-screen, then replace the previous
    // A → B surface in one DOM operation. There is never an empty chart host.
    host.replaceChildren(...candidate.childNodes);
    stagingHost = null;
    transition = next;
    previous?.destroy();
  } catch (error) {
    candidate.remove();
    stagingHost = null;
    throw error;
  }
  current = toIndex;
  currentLabel.value = states[toIndex].label;
  if (animate) transition.play({ duration: 1350 });
  else transition.progress(1);
}

function toggle() {
  running.value = !running.value;
  if (running.value) {
    status.value = 'Auto-playing live transition';
    queueNext();
  } else {
    window.clearTimeout(timeout);
    transition?.pause();
    status.value = 'Paused on current state';
  }
}

async function advance() {
  window.clearTimeout(timeout);
  const next = chooseNext();
  nextLabel.value = states[next].label;
  await moveTo(current, next, true);
  if (running.value) queueNext(2350);
}
</script>

<template>
  <section v-if="props.variant === 'hero'" class="hero-transition" aria-label="Live bar chart transition showcase">
    <div ref="target" class="hero-transition-chart" aria-label="Animated VisDelta bar chart"></div>
    <p><span class="transition-showcase-pulse" aria-hidden="true"></span>Live chart · {{ currentLabel }}</p>
  </section>
  <section v-else class="transition-showcase" aria-label="Live bar chart transition showcase">
    <div class="transition-showcase-topline">
      <p><span class="transition-showcase-pulse" aria-hidden="true"></span>{{ status }}</p>
      <div class="transition-showcase-actions">
        <button type="button" @click="advance">Show another</button>
        <button type="button" :aria-pressed="!running" @click="toggle">{{ running ? 'Pause' : 'Resume' }}</button>
      </div>
    </div>
    <div class="transition-showcase-main">
      <div ref="target" class="transition-showcase-chart" aria-label="Animated VisDelta bar chart"></div>
      <aside class="transition-showcase-copy">
        <p class="transition-showcase-label">Current state</p>
        <h3>{{ currentLabel }}</h3>
        <p>Each move starts with a new immutable chart state. VisDelta works out the difference, then preserves readable axes and marks while it animates.</p>
        <div class="transition-showcase-next">
          <span>Up next, at random</span>
          <strong>{{ nextLabel }}</strong>
        </div>
      </aside>
    </div>
  </section>
</template>
