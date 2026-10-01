<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const charts = [
  { key: 'bar', label: 'Bar', mode: 'bar-lab', initial: 'measure' },
  { key: 'line', label: 'Line', mode: 'line-lab', initial: 'x' },
  { key: 'area', label: 'Area', mode: 'area-lab', initial: 'split' },
  { key: 'point', label: 'Point', mode: 'point-lab', initial: 'x' },
  { key: 'unit', label: 'Unit', mode: 'unit-lab', initial: 'bar' }
];

const activeKey = ref(charts[0].key);
const activeInitial = ref(charts[0].initial);
const activeChart = computed(() => charts.find(chart => chart.key === activeKey.value) ?? charts[0]);

function readRoute() {
  if (typeof location === 'undefined') return { chart: charts[0].key, scenario: charts[0].initial };
  const [chartKey, scenario] = location.hash.slice(1).split('/');
  const chart = charts.find(candidate => candidate.key === chartKey) ?? charts[0];
  return { chart: chart.key, scenario: scenario || chart.initial };
}

function selectChart(chart) {
  activeKey.value = chart.key;
  activeInitial.value = chart.initial;
  history.replaceState(null, '', `#${chart.key}/${chart.initial}`);
}

function syncRoute() {
  const next = readRoute();
  activeKey.value = next.chart;
  activeInitial.value = next.scenario;
}

onMounted(() => {
  syncRoute();
  window.addEventListener('hashchange', syncRoute);
});
onBeforeUnmount(() => window.removeEventListener('hashchange', syncRoute));
</script>

<template>
  <section class="chart-playground">
    <nav class="chart-playground-tabs" aria-label="Chart type">
      <span>Chart type</span>
      <div role="tablist">
        <button
          v-for="chart in charts"
          :key="chart.key"
          type="button"
          role="tab"
          :aria-selected="activeKey === chart.key"
          :class="{ 'is-active': activeKey === chart.key }"
          @click="selectChart(chart)"
        >{{ chart.label }}</button>
      </div>
    </nav>
    <SyntaxPlayground
      :key="`${activeChart.mode}:${activeInitial}`"
      :mode="activeChart.mode"
      :initial="activeInitial"
      :hash-prefix="activeChart.key"
    />
  </section>
</template>
