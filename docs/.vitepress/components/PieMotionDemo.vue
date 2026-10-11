<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
const gaugeHost = ref(null);
const seriesHost = ref(null);
const position = ref(0);
const status = ref('Loading…');
let controllers = [];
let disposed = false;
let monitor = 0;
let resizer;
const code = `import { pie } from "visdelta/pie";
import { transition } from "visdelta/transition";

const rows = [
  { fruit: "A", apples: 30, oranges: 65 },
  { fruit: "B", apples: 50, oranges: 20 },
  { fruit: "C", apples: 20, oranges: 15 }
];
const a = pie(rows).value("apples").color("fruit")
  .key("fruit").label("fruit").innerRadius(0.75);
const b = a.value("oranges");
const motion = await transition(a, b, { target, height: 300 });
motion.play({ from: 0, to: 1, duration: 750 });
// motion.progress(0.5); // scrub
// motion.play({ from: 1, to: 0 }); // reverse`;
onMounted(async () => {
  try {
    const [{ pie }, { transition }] = await Promise.all([import('../../../dist/pie.js'), import('../../../dist/transition-entry.js')]);
    const gaugeRows = fraction => [{ part: 'Selected', value: fraction }, { part: 'Remaining', value: 1 - fraction }];
    const a = pie(gaugeRows(0.127)).value('value').key('part').color('part', { domain: ['Selected', 'Remaining'], range: ['#d58c28', '#d8dee2'] }).innerRadius(0.75).labels('none');
    const b = a.data(gaugeRows(0.76));
    const rows = [{ fruit: 'A', apples: 30, oranges: 65 }, { fruit: 'B', apples: 50, oranges: 20 }, { fruit: 'C', apples: 20, oranges: 15 }];
    const from = pie(rows).value('apples').key('fruit').label('fruit').color('fruit').innerRadius(0.75);
    const first = await transition(a, b, { target: gaugeHost.value, height: 300 });
    if (disposed) { first.destroy(); return; }
    controllers.push(first);
    const second = await transition(from, from.value('oranges'), { target: seriesHost.value, height: 300 });
    if (disposed) { second.destroy(); return; }
    controllers.push(second);
    controllers.forEach(controller => controller.progress(0));
    resizer = new ResizeObserver(() => controllers.forEach(controller => controller.resize()));
    resizer.observe(gaugeHost.value);
    resizer.observe(seriesHost.value);
    status.value = 'Ready';
  } catch (error) { status.value = error.message; }
});
function scrub(event) {
  cancelAnimationFrame(monitor);
  position.value = Number(event.target.value);
  controllers.forEach(controller => { controller.pause(); controller.progress(position.value); });
}
function play(reverse = false) {
  controllers.forEach(controller => controller.play({ from: reverse ? 1 : 0, to: reverse ? 0 : 1, duration: 750 }));
  cancelAnimationFrame(monitor);
  const destination = reverse ? 0 : 1;
  function follow() {
    if (disposed || !controllers.length) return;
    position.value = controllers[0].value;
    if (position.value !== destination) monitor = requestAnimationFrame(follow);
  }
  follow();
}
onBeforeUnmount(() => { disposed = true; resizer?.disconnect(); cancelAnimationFrame(monitor); controllers.forEach(controller => controller.destroy()); controllers = []; });
</script>
<template>
  <section class="pie-motion-demo" aria-label="Pie and donut motion">
    <h2>Interpolate angles, then draw arcs</h2>
    <p>Both examples use VisDelta’s seekable recorder. Authored data stays immutable; arc geometry interpolates in polar coordinates.</p>
    <div class="comparison-filters">
      <button class="ui-button" :disabled="status !== 'Ready'" @click="play()">Play arcs</button>
      <button class="ui-button" :disabled="status !== 'Ready'" @click="play(true)">Reverse arcs</button>
      <label>Progress <input aria-label="Arc progress" type="range" min="0" max="1" step="0.01" :value="position" :disabled="status !== 'Ready'" @input="scrub"></label>
      <span role="status" class="pie-motion-status">{{ status }}</span>
    </div>
    <div class="comparison-pair">
      <figure class="comparison-side"><figcaption>Single share · 12.7% → 76%</figcaption><div ref="gaugeHost" data-pie-motion="gauge"></div></figure>
      <figure class="comparison-side"><figcaption>Three components · apples → oranges</figcaption><div ref="seriesHost" data-pie-motion="series"></div></figure>
    </div>
    <details class="comparison-code"><summary>Runnable donut transition</summary><DocsCodeBlock :code="code" language="js" /></details>
  </section>
</template>
