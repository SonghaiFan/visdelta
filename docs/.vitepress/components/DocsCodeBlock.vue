<script setup>
import { computed } from 'vue';

const props = defineProps({
  code: { type: String, required: true },
  language: { type: String, default: 'js' },
  highlightedLine: { type: Number, default: -1 },
  embedded: { type: Boolean, default: false }
});

const lines = computed(() => props.code.split('\n'));
const isJavaScript = computed(() => ['js', 'ts', 'javascript', 'typescript'].includes(props.language));

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  })[character]);
}

function highlight(line) {
  const source = escapeHtml(line);
  const tokenPattern = isJavaScript.value
    ? /("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(\/\/.*$)|\b(await|const|export|from|import|return|new|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)(?=\s*\()/g
    : /("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(\/\/.*$)|\b(true|false|null)\b|\b(\d+(?:\.\d+)?)\b/g;

  return source.replace(tokenPattern, (match, doubleQuote, singleQuote, comment, keyword, number, callable) => {
    if (doubleQuote || singleQuote) return `<span class="token-string">${match}</span>`;
    if (comment) return `<span class="token-comment">${match}</span>`;
    if (keyword) return `<span class="token-keyword">${match}</span>`;
    if (number) return `<span class="token-number">${match}</span>`;
    if (callable) return `<span class="token-function">${match}</span>`;
    return match;
  });
}
</script>

<template>
  <pre class="doc-code-block" :class="{ 'is-embedded': embedded }" :data-language="language"><code><span
    v-for="(line, index) in lines"
    :key="`${index}-${line}`"
    class="doc-code-line"
    :class="{ 'is-highlighted': index === highlightedLine }"
  ><i aria-hidden="true">{{ index + 1 }}</i><span v-html="highlight(line)" /></span></code></pre>
</template>
