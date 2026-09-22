<script setup>
import StateChangeIcon from './StateChangeIcon.vue';

const categories = [
  {
    name: 'Data',
    glyph: 'data',
    question: 'Which source records participate, and did their values change?',
    syntax: ['.data()', '.where()'],
    actions: ['add', 'remove', 'update']
  },
  {
    name: 'Grain',
    glyph: 'grain',
    question: 'Which records make one mark, and how is its measure calculated?',
    syntax: ['.rollup()', '.breakdown()', 'Unit .value()'],
    actions: ['split', 'merge', 'reaggregate', 'change-reducer']
  },
  {
    name: 'Encoding',
    glyph: 'encoding',
    question: 'Which data field is bound to which visual channel?',
    syntax: ['.x()', '.y()', '.color()', '.size()'],
    actions: ['bind', 'unbind', 'remap']
  },
  {
    name: 'Coordinate',
    glyph: 'coordinate',
    question: 'How are values mapped into position and space?',
    syntax: ['.flip()', '{ domain }', '{ scale }'],
    actions: ['rescale', 'reorient']
  },
  {
    name: 'Layout',
    glyph: 'layout',
    question: 'How are the same objects arranged or connected?',
    syntax: ['.layout()', '.sort()', '.connector()'],
    actions: ['reorder', 'rearrange', 'reconnect']
  },
  {
    name: 'Attention',
    glyph: 'attention',
    question: 'Which objects are emphasized or framed by the camera?',
    syntax: ['.focus()', '.highlight()'],
    actions: ['enter', 'exit', 'shift'],
    targets: ['focus', 'highlight']
  },
  {
    name: 'Appearance',
    glyph: 'appearance',
    question: 'What fixed visual form or styling is used?',
    syntax: ['.color("#…")', '.radius()', '.strokeWidth()', '.curve()'],
    actions: ['restyle', 'reshape']
  }
];
</script>

<template>
  <div class="state-change-catalogue" aria-label="Seven state-change categories">
    <article v-for="(category, index) in categories" :key="category.name">
      <div class="category-icon" aria-hidden="true">
        <StateChangeIcon :category="category.glyph" />
      </div>
      <div class="category-copy">
        <div class="category-heading">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <h3>{{ category.name }}</h3>
        </div>
        <p>{{ category.question }}</p>
        <div class="category-vocabulary">
          <div class="vocabulary-row">
            <span>Public syntax</span>
            <div :aria-label="`${category.name} related public syntax`">
              <code v-for="item in category.syntax" :key="item">{{ item }}</code>
            </div>
          </div>
          <div class="vocabulary-row">
            <span>Emitted actions</span>
            <div :aria-label="`${category.name} emitted actions`">
              <code v-for="action in category.actions" :key="action">{{ action }}</code>
            </div>
          </div>
          <div v-if="category.targets" class="vocabulary-row">
            <span>Targets</span>
            <div :aria-label="`${category.name} targets`">
              <code v-for="target in category.targets" :key="target">{{ target }}</code>
            </div>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.state-change-catalogue {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 28px 0 36px;
}

article {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 18px;
  min-height: 210px;
  padding: 24px;
  border: 0;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

article:last-child {
  grid-column: 1 / -1;
  min-height: 164px;
}

.category-icon {
  --state-icon-cutout: var(--vp-c-brand-1);
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: var(--vp-c-brand-1);
  color: #fff;
}

.category-icon svg { width: 30px; height: 30px; fill: currentColor; }

.category-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.category-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.category-heading span {
  color: var(--vp-c-text-3);
  font: 10px/1 var(--vp-font-family-mono);
}

.category-heading h3 {
  margin: 0;
  border: 0;
  font-size: 19px;
  letter-spacing: -.025em;
}

p {
  margin: 14px 0 24px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.55;
}

.category-vocabulary {
  display: grid;
  gap: 8px;
  margin-top: auto;
}

.vocabulary-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
}

.vocabulary-row > span {
  padding-top: 4px;
  color: var(--vp-c-text-3);
  font: 9px/1.2 var(--vp-font-family-mono);
  letter-spacing: .04em;
  text-transform: uppercase;
}

.vocabulary-row > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.vocabulary-row code {
  padding: 3px 7px;
  border: 0;
  border-radius: 6px;
  background: color-mix(in srgb, var(--vp-c-bg) 68%, var(--vp-c-bg-soft));
  color: var(--vp-c-text-2);
  font-size: 10px;
}

@media (max-width: 720px) {
  .state-change-catalogue { grid-template-columns: 1fr; }
  article,
  article:last-child { grid-column: auto; min-height: 0; }
  .vocabulary-row { grid-template-columns: 1fr; }
}

@media (max-width: 460px) {
  article { grid-template-columns: 40px minmax(0, 1fr); gap: 14px; padding: 20px; }
  .category-icon { width: 40px; height: 40px; }
}
</style>
