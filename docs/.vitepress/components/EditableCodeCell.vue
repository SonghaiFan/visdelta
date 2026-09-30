<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { codeEditorTheme } from './codeEditorTheme.js';

const props = defineProps({
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
  view = new EditorView({
    doc: props.modelValue,
    parent: host.value,
    extensions: [
      basicSetup,
      javascript(),
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
