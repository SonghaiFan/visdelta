<script setup>
import { onMounted, ref } from 'vue';

const groups = [
  {
    title: 'Color',
    kind: 'color',
    tokens: [
      'canvas', 'surface', 'surface-strong', 'raised', 'line', 'text', 'text-muted', 'text-subtle',
      'inverse', 'accent', 'accent-soft', 'success', 'warning', 'danger'
    ].map(name => `--ui-color-${name}`)
  },
  {
    title: 'Code',
    kind: 'color',
    tokens: ['bg', 'text', 'muted', 'keyword', 'string', 'number', 'function'].map(name => `--ui-code-${name}`)
  },
  { title: 'Spacing', kind: 'space', tokens: [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 24].map(step => `--ui-space-${step}`) },
  { title: 'Radius', kind: 'radius', tokens: ['xs', 'sm', 'md', 'lg'].map(name => `--ui-radius-${name}`) },
  {
    title: 'Type',
    kind: 'type',
    tokens: ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl'].map(name => `--ui-text-${name}`)
  },
  { title: 'Controls', kind: 'space', tokens: ['--ui-control-sm', '--ui-control-md', '--ui-control-lg', '--ui-panel-head'] },
  { title: 'Elevation', kind: 'shadow', tokens: ['--ui-shadow-float', '--ui-shadow-alert'] }
];

const values = ref({});

function read() {
  const style = getComputedStyle(document.documentElement);
  values.value = Object.fromEntries(groups.flatMap(group => group.tokens)
    .map(token => [token, style.getPropertyValue(token).trim()]));
}

onMounted(() => {
  read();
  // VitePress toggles `.dark` on <html>; re-read the semantic tier when it does.
  new MutationObserver(read).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});
</script>

<template>
  <div class="design-tokens">
    <section v-for="group in groups" :key="group.title" class="token-section">
      <h3>{{ group.title }}</h3>
      <div v-if="group.kind === 'color'" class="token-grid">
        <div v-for="token in group.tokens" :key="token" class="token-swatch">
          <i :style="{ background: `var(${token})` }"></i>
          <div><code>{{ token }}</code><span>{{ values[token] }}</span></div>
        </div>
      </div>
      <div v-else class="token-rows">
        <div v-for="token in group.tokens" :key="token" class="token-row">
          <code>{{ token }}</code>
          <b v-if="group.kind === 'space'" :style="{ width: `var(${token})` }"></b>
          <i v-else-if="group.kind === 'radius'" class="token-radius" :style="{ borderRadius: `var(${token})` }"></i>
          <span v-else-if="group.kind === 'type'" class="token-type" :style="{ fontSize: `var(${token})` }">Chart change, animated</span>
          <i v-else class="token-shadow" :style="{ boxShadow: `var(${token})` }"></i>
          <span>{{ values[token] }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
