<script setup>
import { computed, ref, shallowRef } from 'vue';
import * as d3 from 'd3';

const props = defineProps({ chart: String, busy: Boolean });
const emit = defineEmits(['load']);
const dialog = ref(null);
const datasets = [
  { id: 'sites', label: 'Nordic sites · homepage demo', x: 'country', y: 'sites' },
  { id: 'mtcars', label: 'Motor cars · 32 models', x: 'name', y: 'mpg' },
  { id: 'iris', label: 'Iris · 150 flowers', x: 'flowerId', y: 'sepalLength' },
  { id: 'us-population-state-age-tidy', label: 'US population · states and ages', x: 'state', y: 'population' }
];
const choice = ref('sites');
const pending = shallowRef(null);
const x = ref('');
const y = ref('');
const error = ref('');
const loading = ref(false);
let version = 0;
const columns = computed(() => [...new Set((pending.value?.rows ?? []).flatMap(Object.keys))]);
const source = computed(() => {
  if (!pending.value || !x.value || !y.value) return '';
  const mapping = props.chart === 'unit' ? 'value' : 'y';
  const options = props.chart === 'unit' ? ', { maxUnits: 200 }' : '';
  const filter = pending.value.id === 'us-population-state-age-tidy' ? '\n  .where({ age: "<10" })' : '';
  const sites = pending.value.id === 'sites' ? '\n  .where({ year: 2022 })' : '';
  return `const chart = ${props.chart}(rows)${filter}${sites}\n  .x(${JSON.stringify(x.value)})\n  .${mapping}(${JSON.stringify(y.value)}${options});`;
});
function validate(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || Array.isArray(row) || typeof row !== 'object')) {
    throw new Error('Use a non-empty CSV table or a JSON array of row objects.');
  }
  if (rows.some(row => Object.values(row).some(value => value !== null && typeof value === 'object' && !(value instanceof Date)))) {
    throw new Error('Use a flat table: each field must contain a string, number, boolean or null.');
  }
  return rows;
}
async function loadDemo() {
  const request = ++version;
  loading.value = true;
  error.value = '';
  try {
    const dataset = datasets.find(item => item.id === choice.value);
    const rows = dataset.id === 'sites' ? [
      { year: 2004, country: 'Norway', sites: 5 }, { year: 2004, country: 'Denmark', sites: 4 }, { year: 2004, country: 'Sweden', sites: 13 },
      { year: 2022, country: 'Norway', sites: 8 }, { year: 2022, country: 'Denmark', sites: 10 }, { year: 2022, country: 'Sweden', sites: 15 }
    ] : await d3.csv(`./data/${dataset.id}.csv`, d3.autoType);
    if (request !== version) return;
    pending.value = { id: dataset.id, name: dataset.label.split(' · ')[0], rows: validate(rows) };
    x.value = props.chart === 'point' && dataset.id === 'mtcars' ? 'wt' : props.chart === 'point' && dataset.id === 'iris' ? 'petalLength' : dataset.x;
    y.value = dataset.y;
  } catch (cause) { if (request === version) { pending.value = null; error.value = cause.message; } }
  finally { if (request === version) loading.value = false; }
}
async function upload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const request = ++version;
  loading.value = true;
  pending.value = null;
  error.value = '';
  try {
    const text = await file.text();
    const rows = /\.json$/i.test(file.name) ? JSON.parse(text) : /\.csv$/i.test(file.name) ? d3.csvParse(text, d3.autoType) : (() => { throw new Error('Choose a .csv or .json file.'); })();
    if (request !== version) return;
    pending.value = { name: file.name, rows: validate(rows) };
    x.value = '';
    y.value = '';
  } catch (cause) { if (request === version) error.value = cause.message; }
  finally { if (request === version) loading.value = false; event.target.value = ''; }
}
function open() { dialog.value.showModal(); loadDemo(); }
function close() { ++version; loading.value = false; dialog.value.close(); }
function apply() {
  if (!source.value || loading.value || props.busy) return;
  emit('load', { ...pending.value, code: source.value });
  close();
}
</script>

<template>
  <button class="dataset-open" :disabled="busy" @click="open">Load data <span aria-hidden="true">↗</span></button>
  <dialog ref="dialog" class="dataset-dialog" aria-labelledby="dataset-dialog-title" @cancel.prevent="close">
    <header><div><span>DATA SOURCE</span><h2 id="dataset-dialog-title">Make it your data.</h2></div><button aria-label="Close data picker" @click="close">×</button></header>
    <div class="dataset-sources">
      <label>Demo datasets<select v-model="choice" aria-label="Demo dataset" @change="loadDemo"><option v-for="item in datasets" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
      <label class="dataset-upload">Load CSV / JSON<input type="file" accept=".csv,.json" aria-label="Upload dataset" @change="upload" /></label>
    </div>
    <p class="dataset-local">Files stay in this browser. Choose fields below to create an editable chart state.</p>
    <p v-if="loading" role="status">Loading data…</p>
    <p v-if="error" role="alert" class="snapshot-error">{{ error }}</p>
    <template v-if="pending && !loading">
      <div class="dataset-preview-title"><strong>{{ pending.name }}</strong><span>{{ pending.rows.length }} records · {{ columns.length }} fields</span></div>
      <div class="dataset-preview"><table><thead><tr><th v-for="field in columns" :key="field">{{ field }}</th></tr></thead><tbody><tr v-for="(row, index) in pending.rows.slice(0, 5)" :key="index"><td v-for="field in columns" :key="field">{{ row[field] ?? '∅' }}</td></tr></tbody></table></div>
      <div class="dataset-mapping">
        <label>X field<select v-model="x" aria-label="X field"><option disabled value="">Choose a field</option><option v-for="field in columns" :key="field">{{ field }}</option></select></label>
        <label>{{ chart === 'unit' ? 'Quantity field' : 'Y field' }}<select v-model="y" aria-label="Y field"><option disabled value="">Choose a field</option><option v-for="field in columns" :key="field">{{ field }}</option></select></label>
      </div>
      <pre v-if="source" class="dataset-source">{{ source }}</pre>
    </template>
    <footer><span>Adds a snapshot. Earlier frames keep their data.</span><button :disabled="!source || loading || busy" @click="apply">Use dataset →</button></footer>
  </dialog>
</template>
