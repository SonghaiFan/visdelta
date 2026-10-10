<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import * as d3 from 'd3';
import { datasetName, idiomGroups, idioms } from './galleryIdioms.js';

// Every tile is drawn by VisDelta from the idiom's code and bundled data. A
// tile is the idiom's finished state; the viewer shows it large and live.
const factories = {
  bar: () => import('../../../dist/bar.js').then(module => module.bar),
  line: () => import('../../../dist/line.js').then(module => module.line),
  area: () => import('../../../dist/area.js').then(module => module.area),
  point: () => import('../../../dist/point.js').then(module => module.point),
  unit: () => import('../../../dist/unit.js').then(module => module.unit)
};

const query = ref('');
const tileStatus = ref({});
const viewer = ref(null);
const viewerStage = ref(null);
const openId = ref(null);
const viewerStatus = ref('');

const filtered = computed(() => {
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return idioms.filter(idiom => terms.every(term =>
    `${idiom.title} ${idiom.mark} ${datasetName(idiom.data)}`.toLowerCase().includes(term)));
});
const groups = computed(() => idiomGroups
  .map(group => ({ ...group, idioms: filtered.value.filter(idiom => idiom.mark === group.mark) }))
  .filter(group => group.idioms.length));
const current = computed(() => idioms.find(idiom => idiom.id === openId.value) ?? null);
const currentIndex = computed(() => filtered.value.findIndex(idiom => idiom.id === openId.value));
const currentGroup = computed(() => idiomGroups.find(group => group.mark === current.value?.mark));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const dataCache = new Map();
const tiles = new Map();
// Thumbnails are frozen copies of a finished render: keeping dozens of live
// controllers makes every resize re-render all of them at once.
const drawnWidths = new Map();
const pending = new Set();
let queue = Promise.resolve();
let resizeTimer = 0;
let transitionApi = null;
let observer = null;
let resizeObserver = null;
let viewerChart = null;
let viewerState = null;
let viewerVersion = 0;
let disposed = false;

async function loadRows(url) {
  if (!dataCache.has(url)) dataCache.set(url, d3.csv(url, d3.autoType));
  return structuredClone(await dataCache.get(url));
}

async function evaluate(idiom) {
  const [factory, rows] = await Promise.all([factories[idiom.mark](), loadRows(idiom.data)]);
  const run = new AsyncFunction(idiom.mark, 'd3', 'rows', `"use strict";\n${idiom.code}\nreturn chart;`);
  return run(factory, d3, rows);
}

async function draw(state, target, height, from = state) {
  transitionApi ??= await import('../../../dist/transition-entry.js');
  return transitionApi.transition(from, state, { target, height });
}

function setTile(id, status) {
  tileStatus.value = { ...tileStatus.value, [id]: status };
}

function registerTile(id, element) {
  const previous = tiles.get(id);
  if (element === previous) return;
  if (previous) {
    // Search unmounts tiles; release them so a returning tile draws again.
    observer?.unobserve(previous);
    drawnWidths.delete(id);
    pending.delete(id);
    tiles.delete(id);
  }
  if (!element) return;
  tiles.set(id, element);
  observer?.observe(element);
}

function renderTile(id) {
  const target = tiles.get(id);
  if (!target || drawnWidths.has(id) || pending.has(id) || disposed) return;
  pending.add(id);
  setTile(id, tileStatus.value[id] === 'ready' ? 'ready' : 'loading');
  // One tile at a time keeps scrolling responsive while thumbnails arrive.
  queue = queue.then(() => drawTile(id, target)).catch(() => {});
}

async function drawTile(id, target) {
  const idiom = idioms.find(candidate => candidate.id === id);
  try {
    if (disposed || tiles.get(id) !== target) return;
    const state = await evaluate(idiom);
    if (disposed || tiles.get(id) !== target) return;
    const host = document.createElement('div');
    host.className = 'idiom-thumb-render';
    target.append(host);
    try {
      const chart = await draw(state, host, 220);
      chart.progress(1);
      const frozen = [...host.childNodes].map(node => node.cloneNode(true));
      chart.destroy();
      if (disposed || tiles.get(id) !== target) return;
      target.replaceChildren(...frozen);
      drawnWidths.set(id, target.clientWidth);
      setTile(id, 'ready');
    } finally {
      host.remove();
    }
  } catch (cause) {
    setTile(id, `error:${cause instanceof Error ? cause.message : cause}`);
  } finally {
    pending.delete(id);
  }
}

function redrawResizedTiles() {
  for (const [id, target] of tiles) {
    const width = drawnWidths.get(id);
    if (width == null || Math.abs(target.clientWidth - width) < 24) continue;
    drawnWidths.delete(id);
    renderTile(id);
  }
}

async function openIdiom(idiom) {
  const previousMark = current.value?.mark;
  openId.value = idiom.id;
  if (!viewer.value.open) viewer.value.showModal();
  if (typeof history !== 'undefined') history.replaceState(null, '', `#${idiom.id}`);
  await nextTick();
  const version = ++viewerVersion;
  viewerStatus.value = 'Rendering';
  try {
    const state = await evaluate(idiom);
    if (version !== viewerVersion || disposed) return;
    const host = document.createElement('div');
    host.className = 'idiom-viewer-candidate';
    viewerStage.value.append(host);
    let chart;
    // Moving between idioms of one mark morphs the previous chart briefly;
    // anything VisDelta cannot route is simply redrawn.
    const from = previousMark === idiom.mark && viewerState ? viewerState : state;
    try {
      chart = await draw(state, host, viewerHeight(), from);
    } catch {
      chart = await draw(state, host, viewerHeight());
    }
    if (version !== viewerVersion || disposed) {
      chart.destroy();
      host.remove();
      return;
    }
    viewerChart?.destroy();
    viewerStage.value.replaceChildren(host);
    host.className = 'idiom-viewer-chart';
    viewerChart = chart;
    viewerState = state;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (from !== state && !reducedMotion) {
      chart.progress(0);
      chart.play({ from: 0, to: 1, duration: 700 });
    } else {
      chart.progress(1);
    }
    viewerStatus.value = '';
  } catch (cause) {
    if (version === viewerVersion) viewerStatus.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function viewerHeight() {
  return Math.max(300, Math.min(560, Math.round(window.innerHeight * 0.58)));
}

function step(direction) {
  const list = filtered.value;
  if (!list.length) return;
  const index = currentIndex.value < 0 ? 0 : currentIndex.value;
  openIdiom(list[(index + direction + list.length) % list.length]);
}

function closeViewer() {
  viewer.value?.close();
}

function onViewerClose() {
  viewerVersion += 1;
  viewerChart?.destroy();
  viewerChart = null;
  viewerState = null;
  openId.value = null;
  if (typeof history !== 'undefined' && location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function onViewerKey(event) {
  if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
}

function onViewerClick(event) {
  // A click on the backdrop (the dialog element itself) closes the viewer.
  if (event.target === viewer.value) closeViewer();
}

onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(redrawResizedTiles, 300);
  });
  resizeObserver.observe(document.documentElement);
  observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        renderTile(entry.target.dataset.idiom);
      }
    }, { rootMargin: '300px' })
    : null;
  await nextTick();
  for (const [id, element] of tiles) {
    if (observer) observer.observe(element);
    else renderTile(id);
  }
  const linked = idioms.find(idiom => idiom.id === location.hash.slice(1));
  if (linked) openIdiom(linked);
});

onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  resizeObserver?.disconnect();
  clearTimeout(resizeTimer);
  viewerChart?.destroy();
});
</script>

<template>
  <section class="idiom-gallery" aria-label="Visual idioms">
    <nav class="idiom-index" aria-label="Idiom marks">
      <a v-for="group in idiomGroups" :key="group.mark" :href="`#marks-${group.mark}`">
        {{ group.title }} <span>{{ filtered.filter(idiom => idiom.mark === group.mark).length }}</span>
      </a>
      <label class="idiom-search">
        <span class="ui-label">Filter</span>
        <input v-model="query" type="search" placeholder="stacked, scatter, iris…" aria-label="Filter idioms" />
      </label>
    </nav>

    <p v-if="!groups.length" class="idiom-empty">No idiom matches “{{ query }}”.</p>

    <section v-for="group in groups" :id="`marks-${group.mark}`" :key="group.mark" class="idiom-group">
      <header class="idiom-group-head">
        <h2>{{ group.title }}</h2>
        <p>{{ group.summary }}</p>
      </header>
      <div class="idiom-grid">
        <button
          v-for="idiom in group.idioms"
          :key="idiom.id"
          type="button"
          class="idiom-tile"
          :data-idiom-tile="idiom.id"
          :aria-label="`Open ${idiom.title}`"
          @click="openIdiom(idiom)"
        >
          <span class="idiom-thumb">
            <span :ref="element => registerTile(idiom.id, element)" class="idiom-thumb-chart" :data-idiom="idiom.id"></span>
            <span v-if="tileStatus[idiom.id]?.startsWith('error:')" class="idiom-thumb-status is-error" role="alert">{{ tileStatus[idiom.id].slice(6) }}</span>
            <span v-else-if="tileStatus[idiom.id] !== 'ready'" class="idiom-thumb-status">Drawing…</span>
          </span>
          <span class="idiom-title">{{ idiom.title }}</span>
        </button>
      </div>
    </section>

    <dialog
      ref="viewer"
      class="idiom-viewer"
      :aria-label="current ? current.title : 'Idiom'"
      @close="onViewerClose"
      @keydown="onViewerKey"
      @click="onViewerClick"
    >
      <div v-if="current" class="idiom-viewer-panel">
        <header class="idiom-viewer-head">
          <span class="ui-label">{{ currentGroup?.title }} · {{ currentIndex + 1 }} / {{ filtered.length }}</span>
          <h2>{{ current.title }}</h2>
          <div class="idiom-viewer-nav">
            <button type="button" class="ui-button" aria-label="Previous idiom" @click="step(-1)">←</button>
            <button type="button" class="ui-button" aria-label="Next idiom" @click="step(1)">→</button>
            <button type="button" class="ui-button" aria-label="Close" @click="closeViewer">✕</button>
          </div>
        </header>
        <div class="idiom-viewer-body">
          <div class="idiom-viewer-stage">
            <div ref="viewerStage" class="idiom-viewer-target" aria-label="Live chart"></div>
            <p v-if="viewerStatus" class="idiom-viewer-status" :role="viewerStatus === 'Rendering' ? 'status' : 'alert'">{{ viewerStatus }}</p>
          </div>
          <aside class="idiom-viewer-side">
            <DocsCodeBlock :code="current.code" language="js" />
            <p class="idiom-viewer-data">
              <span class="ui-label">rows</span>
              <a :href="current.data" target="_blank" rel="noopener">{{ datasetName(current.data) }}.csv</a>
            </p>
            <a class="ui-button is-primary" :href="`./playground.html#${current.mark}/idiom=${current.id}`">Edit in Playground →</a>
          </aside>
        </div>
      </div>
    </dialog>
  </section>
</template>
