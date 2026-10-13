<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
const props = defineProps({ rows: { type: Array, default: () => ['A','B','C','D'].flatMap((label, i) =>
  ['Core','Growth','Services','Support'].map((part, j) => ({ label, part, value: [90,20,10,30][j] + [0,-10,-20,-10][i] * (j === 0 ? 1 : 0) + (j === 1 ? i * 5 : 0) })) ) } });
const host = ref(null);
const direction = ref('y');
const scales = ref('shared');
const position = ref(0);
const status = ref('Loading…');
let motion;
let resize;
let monitor = 0;
let disposed = false;
let generation = 0;
const code = computed(() => `import { bar } from "visdelta/bar";
import { transition } from "visdelta/transition";

const a = bar(rows).x("label").y("value", { label: "Units" })
  .key(["label", "part"]).breakdown("part")
  .color("part", { domain: ["Core", "Growth", "Services", "Support"],
    range: ["#176078", "#19a4c5", "#2ce5b4", "#00b59c"] });
const b = a.repeat("part", { direction: "${direction.value}", scales: "${scales.value}", minWidth: 180 });
const motion = await transition(a, b, { target, height: 740 });
motion.play({ from: 0, to: 1, duration: 1200 });
// motion.play({ from: 1, to: 0, duration: 1200 });
// motion.progress(0.5);`);
async function build() {
  cancelAnimationFrame(monitor);
  const version = ++generation;
  motion?.pause();
  status.value = 'Loading…';
  try {
    const [{ bar }, { transition }] = await Promise.all([import('../../../dist/bar.js'), import('../../../dist/transition-entry.js')]);
    if (disposed || version !== generation) return;
    motion?.destroy();
    const a = bar(props.rows).x('label').y('value', { label: 'Units' }).key(['label', 'part']).breakdown('part')
      .color('part', { domain: ['Core','Growth','Services','Support'], range: ['#176078','#19a4c5','#2ce5b4','#00b59c'] });
    const b = a.repeat('part', { direction: direction.value, scales: scales.value, minWidth: 180 });
    const next = await transition(a, b, { target: host.value, height: 740 });
    if (disposed || version !== generation) { next.destroy(); return; }
    motion = next; motion.progress(position.value); status.value = 'Ready';
  } catch (error) { status.value = error.message; }
}
function scrub(event) { cancelAnimationFrame(monitor); position.value = Number(event.target.value); motion?.pause().progress(position.value); }
function play(reverse = false) {
  if (!motion) return;
  const current = motion.value;
  const from = reverse ? (current === 0 ? 1 : current) : (current === 1 ? 0 : current);
  motion.play({ from, to: reverse ? 0 : 1, duration: 1200 });
  cancelAnimationFrame(monitor);
  const target = reverse ? 0 : 1;
  function follow() { if (disposed || !motion) return; position.value = motion.value; if (position.value !== target) monitor = requestAnimationFrame(follow); }
  follow();
}
onMounted(async () => { await nextTick(); await build(); resize = new ResizeObserver(() => motion?.resize()); resize.observe(host.value); });
onBeforeUnmount(() => { disposed = true; generation++; resize?.disconnect(); cancelAnimationFrame(monitor); motion?.destroy(); });
</script>
<template>
  <section class="repeat-motion-demo" aria-label="Stacked bars to repeated baselines">
    <div class="comparison-filters">
      <button class="ui-button" :disabled="status !== 'Ready'" @click="play()">Play repeat</button>
      <button class="ui-button" :disabled="status !== 'Ready'" @click="play(true)">Reverse repeat</button>
      <label>Direction <select v-model="direction" aria-label="Repeat direction" @change="build"><option value="y">Y — rows</option><option value="x">X — columns</option><option value="grid">Grid</option></select></label>
      <label>Scales <select v-model="scales" aria-label="Repeat scales" @change="build"><option value="shared">Shared</option><option value="independent">Independent</option></select></label>
      <label>Stacked → repeated <input aria-label="Repeat progress" type="range" min="0" max="1" step="0.01" :value="position" @input="scrub" /></label>
    </div>
    <p v-if="scales === 'independent'">Independent numeric scales emphasize patterns within each panel; bar heights cannot be compared directly across panels.</p>
    <p class="repeat-motion-status" role="status">{{ status }}</p>
    <div ref="host" class="comparison-chart repeat-motion-chart" style="--comparison-chart-height: 740px"></div>
    <details class="comparison-code"><summary>Data &amp; runnable transition code</summary><DocsCodeBlock :code="`const rows = ${JSON.stringify(rows, null, 2)};\n\n${code}`" language="js" /></details>
  </section>
</template>
