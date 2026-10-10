<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { codeEditorTheme } from './codeEditorTheme.js';

const props = defineProps({
  dark: { type: Boolean, default: false },
  modelValue: { type: String, default: '' },
  editorId: { type: String, default: undefined },
  ariaLabel: { type: String, required: true }
});
const emit = defineEmits(['update:modelValue', 'run']);
const host = ref(null);
const editorStyle = computed(() => ({
  '--editable-code-height': `${Math.min(300, Math.max(74, props.modelValue.split('\n').length * 18 + 30))}px`
}));
let view = null;
let applyingValue = false;
let destroyed = false;

onMounted(async () => {
  const [{ basicSetup, EditorView }, { javascript }] = await Promise.all([
    import('codemirror'),
    import('@codemirror/lang-javascript')
  ]);
  if (destroyed) return;
  const darkExtensions = [];
  if (props.dark) {
    const [{ HighlightStyle, syntaxHighlighting }, { tags }] = await Promise.all([
      import('@codemirror/language'), import('@lezer/highlight')
    ]);
    if (destroyed) return;
    darkExtensions.push(
      EditorView.theme({
        '&': { color: 'var(--vd-code-text)', backgroundColor: 'var(--vd-code-bg)' },
        '.cm-gutters': { color: 'var(--vd-code-muted)', borderRight: '0', backgroundColor: 'var(--vd-code-bg)' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#ffffff06' },
        '.cm-cursor': { borderLeftColor: 'var(--vd-code-text)' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#97bbf530' }
      }, { dark: true }),
      syntaxHighlighting(HighlightStyle.define([
        { tag: tags.keyword, color: 'var(--vd-code-keyword)' },
        { tag: [tags.string, tags.regexp], color: 'var(--vd-code-string)' },
        { tag: [tags.number, tags.bool, tags.null], color: 'var(--vd-code-number)' },
        { tag: [tags.function(tags.variableName), tags.propertyName], color: 'var(--vd-code-function)' },
        { tag: tags.comment, color: 'var(--vd-code-muted)' }
      ]))
    );
  }
  view = new EditorView({
    doc: props.modelValue,
    parent: host.value,
    extensions: [
      basicSetup,
      javascript(),
      ...darkExtensions,
      codeEditorTheme(EditorView),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        ...(props.editorId ? { id: props.editorId } : {}),
        'aria-label': props.ariaLabel,
        'aria-multiline': 'true'
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged && !applyingValue) emit('update:modelValue', update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        keydown(event) {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            emit('run');
            return true;
          }
          return false;
        }
      })
    ]
  });
});

watch(() => props.modelValue, value => {
  if (!view || value === view.state.doc.toString()) return;
  applyingValue = true;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  applyingValue = false;
});

onBeforeUnmount(() => {
  destroyed = true;
  view?.destroy();
});
</script>

<template><div ref="host" class="editable-code-cell" :style="editorStyle"></div></template>
