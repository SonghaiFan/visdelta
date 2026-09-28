<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const target = ref(null);
const progress = ref(0);
const status = ref('Loading first transition');
let change = null;
let resizeObserver = null;
let frame = null;

onMounted(async () => {
  try {
    const [{ bar }, { transition }] = await Promise.all([
      import('../../../dist/bar.js'),
      import('../../../dist/transition-entry.js')
    ]);
    const rows = [
      { category: 'Hardware', revenue: 12, profit: 5 },
      { category: 'Software', revenue: 18, profit: 11 },
      { category: 'Services', revenue: 9, profit: 7 }
    ];
    const revenue = bar(rows).x('category').y('revenue', { title: 'Revenue' }).key('category');
    const profit = revenue.y('profit', { title: 'Profit' });
    await nextTick();
    change = await transition(revenue, profit, { target: target.value, height: 280 });
    resizeObserver = new ResizeObserver(() => change?.resize());
    resizeObserver.observe(target.value);
    status.value = 'Ready · drag the transition';
    seek(0);
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Unable to load the example.';
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  change?.destroy();
});

function seek(value) {
  if (!change) return;
  cancelAnimationFrame(frame);
  frame = null;
  change.progress(value);
  progress.value = value;
  status.value = 'Ready · drag the transition';
}

function play(from, to) {
  if (!change) return;
  cancelAnimationFrame(frame);
  change.play({ from, to, duration: 900 });
  status.value = to > from ? 'Playing revenue → profit' : 'Playing profit → revenue';
  const reflect = () => {
    progress.value = change.value;
    if (Math.abs(change.value - to) > 0.0001) frame = requestAnimationFrame(reflect);
    else { frame = null; status.value = 'Ready · drag the transition'; }
  };
  frame = requestAnimationFrame(reflect);
}
</script>

<template>
  <section class="getting-started-demo" aria-label="Live first VisDelta transition">
    <div class="getting-started-demo-head">
      <div><span>Live result</span><strong>Revenue → profit</strong></div>
      <output>{{ progress.toFixed(2) }}</output>
    </div>
    <div ref="target" class="getting-started-demo-chart"></div>
    <div class="getting-started-demo-controls">
      <button type="button" @click="play(0, 1)">Play →</button>
      <input
        type="range" min="0" max="1" step="0.01" :value="progress"
        aria-label="First transition progress"
        @input="seek($event.target.valueAsNumber)"
      />
      <button type="button" @click="play(1, 0)">← Reverse</button>
    </div>
    <p aria-live="polite">{{ status }}</p>
  </section>
</template>
