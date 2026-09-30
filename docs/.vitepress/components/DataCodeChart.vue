<script setup>
import { computed } from 'vue';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  dataStatus: { type: String, default: '' },
  dataTitle: { type: String, default: 'Data at current state' },
  codeTitle: { type: String, default: 'Code' },
  chartTitle: { type: String, default: 'Visualization' }
});

const columns = computed(() => [
  ...new Set(props.rows.flatMap(row => Object.keys(row)))
]);

function displayValue(value) {
  if (value == null) return '∅';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
</script>

<template>
  <div class="data-code-chart">
    <section class="data-code-chart-data" :aria-labelledby="`${$attrs.id || 'data-code-chart'}-data-title`">
      <header class="data-code-chart-head">
        <span :id="`${$attrs.id || 'data-code-chart'}-data-title`">{{ dataTitle }}</span>
        <strong>{{ dataStatus }}</strong>
      </header>
      <div class="data-code-chart-table-wrap">
        <table v-if="rows.length" class="data-code-chart-table">
          <thead>
            <tr><th v-for="column in columns" :key="column" scope="col">{{ column }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="index">
              <td v-for="column in columns" :key="column">{{ displayValue(row[column]) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="data-code-chart-empty"><slot name="empty">No materialized rows for this state.</slot></p>
      </div>
    </section>

    <section class="data-code-chart-chart">
      <header class="data-code-chart-head">
        <span>{{ chartTitle }}</span>
        <slot name="chart-status" />
      </header>
      <slot name="chart" />
    </section>

    <section class="data-code-chart-code">
      <header class="data-code-chart-head">
        <span>{{ codeTitle }}</span>
        <slot name="code-status" />
      </header>
      <slot name="code" />
    </section>
  </div>
</template>
