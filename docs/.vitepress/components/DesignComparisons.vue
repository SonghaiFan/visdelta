<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { comparisonGuides, designComparisons } from './designComparisons.js';
const selected = ref('all');
const statuses = ref({});
const advice = ref({});
const visible = computed(() => designComparisons.filter(item => selected.value === 'all' || item.guide === selected.value));
const groups = computed(() => comparisonGuides.map(guide => ({ ...guide, examples: visible.value.filter(item => item.guide === guide.id) })).filter(guide => guide.examples.length));
const hosts = new Map();
const sizes = new Map();
const pending = new Set();
const factories = {
  bar: () => import('../../../dist/bar.js').then(m => m.bar),
  line: () => import('../../../dist/line.js').then(m => m.line),
  area: () => import('../../../dist/area.js').then(m => m.area),
  point: () => import('../../../dist/point.js').then(m => m.point),
  pie: () => import('../../../dist/pie.js').then(m => m.pie)
};
let observer;
let resizer;
let queue = Promise.resolve();
let disposed = false;
function key(item, side, index) { return `${item.id}/${side}/${index}`; }
function register(item, side, index, element) {
  const id = key(item, side, index);
  const previous = hosts.get(id);
  if (previous?.element === element) return;
  if (previous) observer?.unobserve(previous.element);
  hosts.delete(id);
  sizes.delete(id);
  if (element) {
    element.dataset.comparisonChart = id;
    hosts.set(id, { element, item, side, index });
    observer?.observe(element);
  }
}
function schedule(id) {
  if (disposed || pending.has(id) || sizes.has(id)) return;
  pending.add(id);
  const expected = hosts.get(id);
  queue = queue.then(() => render(id)).finally(() => {
    pending.delete(id);
    if (hosts.get(id) && hosts.get(id) !== expected) schedule(id);
  });
}
async function render(id) {
  const info = hosts.get(id);
  if (!info || disposed) return;
  const { element, item, side, index } = info;
  statuses.value = { ...statuses.value, [id]: 'Drawing…' };
  const declaration = item[side].charts[index];
  let height = item[side].height ?? (item[side].charts.length > 1 ? 180 : 280);
  let controller;
  const stage = document.createElement('div');
  element.append(stage);
  try {
    const [factory, api, hints] = await Promise.all([factories[declaration.mark](), import('../../../dist/transition-entry.js'), import('../../../dist/warnings.js')]);
    const chart = new Function(declaration.mark, 'rows', `${declaration.code}\nreturn chart;`)(factory, structuredClone(item.rows));
    const spec = chart.toSpec();
    if (spec.encoding?.facet) {
      const layout = spec.facetLayout;
      const gap = layout.gap ?? 24;
      const columns = Math.max(1, Math.min(layout.columns ?? 2, Math.floor((element.clientWidth - 24 + gap) / ((layout.minWidth ?? 240) + gap)) || 1));
      const count = new Set(chart.rows().map(row => row[spec.encoding.facet.field])).size;
      height = Math.max(height, Math.ceil(count / columns) * 190 + Math.max(0, Math.ceil(count / columns) - 1) * gap);
      element.style.setProperty('--comparison-chart-height', `${height}px`);
    }
    const warnings = await hints.visualizationWarnings(chart);
    if (disposed || hosts.get(id)?.element !== element) return;
    controller = await api.transition(chart, chart, { target: stage, height });
    controller.progress(1);
    const frozen = [...stage.childNodes].map(node => node.cloneNode(true));
    controller.destroy();
    controller = null;
    if (disposed || hosts.get(id)?.element !== element) return;
    element.replaceChildren(...frozen);
    sizes.set(id, element.clientWidth);
    statuses.value = { ...statuses.value, [id]: '' };
    advice.value = { ...advice.value, [id]: warnings };
  } catch (error) {
    statuses.value = { ...statuses.value, [id]: `Unable to draw: ${error.message}` };
  } finally {
    controller?.destroy();
    stage.remove();
  }
}
function source(item, chart) {
  return `const rows = ${JSON.stringify(item.rows, null, 2)};\n\n${chart.code}`;
}
onMounted(async () => {
  observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) schedule(entry.target.dataset.comparisonChart);
  }), { rootMargin: '400px' });
  await nextTick();
  hosts.forEach(({ element }) => observer.observe(element));
  resizer = new ResizeObserver(() => {
    hosts.forEach(({ element }, id) => {
      if (sizes.has(id) && Math.abs(sizes.get(id) - element.clientWidth) > 20) {
        sizes.delete(id);
        schedule(id);
      }
    });
  });
  resizer.observe(document.documentElement);
});
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); resizer?.disconnect(); });
</script>

<template>
  <div class="design-comparisons">
    <nav class="comparison-filters" aria-label="Design guide">
      <button class="ui-button" :aria-pressed="selected === 'all'" @click="selected = 'all'">All guides</button>
      <button v-for="guide in comparisonGuides" :key="guide.id" class="ui-button" :aria-pressed="selected === guide.id" @click="selected = guide.id">{{ guide.title }}</button>
    </nav>
    <section v-for="guide in groups" :key="guide.id" :aria-label="guide.title" class="comparison-guide">
      <header><h2>{{ guide.title }}</h2><a :href="guide.url" target="_blank" rel="noopener">Read the Datawrapper Academy guide ↗</a></header>
      <article v-for="item in guide.examples" :id="item.id" :key="item.id" class="comparison-example" :data-comparison="item.id">
        <header><h3>{{ item.title }}</h3><p>{{ item.why }}</p></header>
        <div class="comparison-pair">
          <figure v-for="side in ['before', 'after']" :key="side" class="comparison-side" :data-side="side">
            <figcaption class="comparison-verdict">
              <span class="comparison-mark" :data-verdict="side" aria-hidden="true">{{ side === 'before' ? '✕' : '✓' }}</span>
              <span class="ui-label">{{ item[side].label ?? (side === 'before' ? 'Not ideal for this goal' : 'Better for this goal') }}</span>
              <span class="comparison-form">{{ item[side].caption }}</span>
            </figcaption>
            <div class="comparison-frame">
              <p class="comparison-headline">{{ item.story.headline }}</p>
              <p class="comparison-description">{{ item.story.description }}</p>
              <div v-if="item[side].text" class="comparison-statement">{{ item[side].text }}</div>
              <p v-if="item[side].unsupported" class="comparison-limit">{{ item[side].unsupported }}</p>
              <div v-if="item[side].charts" class="comparison-charts" :class="{ 'is-multiple': item[side].charts.length > 1, 'is-compact': item[side].compact }">
                <div v-for="(chart, index) in item[side].charts" :key="index" class="comparison-panel">
                  <div :ref="element => register(item, side, index, element)" class="comparison-chart" :style="{ '--comparison-chart-height': `${item[side].height ?? (item[side].charts.length > 1 ? 180 : 280)}px` }"></div>
                  <p v-if="statuses[key(item, side, index)]" class="comparison-status" :role="statuses[key(item, side, index)].startsWith('Unable') ? 'alert' : 'status'">{{ statuses[key(item, side, index)] }}</p>
                </div>
              </div>
              <footer class="comparison-footer">
                <span v-if="item[side].detail" class="comparison-detail">Note: {{ item[side].detail }}</span>
                <span>Source: Illustrative data · Chart: VisDelta</span>
              </footer>
            </div>
            <template v-if="item[side].charts">
              <div v-for="(chart, index) in item[side].charts" :key="`tools-${index}`" class="comparison-tools">
                <details v-if="advice[key(item, side, index)]?.length" class="comparison-hints">
                  <summary>{{ advice[key(item, side, index)].length }} design hint(s){{ item[side].charts.length > 1 ? ` · panel ${index + 1}` : '' }}</summary>
                  <p v-for="hint in advice[key(item, side, index)]" :key="`${hint.code}/${hint.message}`">{{ hint.message }} {{ hint.suggestion }}</p>
                </details>
                <details class="comparison-code"><summary>Data &amp; runnable code{{ item[side].charts.length > 1 ? ` · panel ${index + 1}` : '' }}</summary><DocsCodeBlock :code="source(item, chart)" language="js" /></details>
              </div>
            </template>
          </figure>
        </div>
      </article>
    </section>
  </div>
</template>
