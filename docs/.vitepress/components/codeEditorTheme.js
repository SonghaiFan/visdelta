export function codeEditorTheme(EditorView) {
  return EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: 'var(--vp-c-text-1)',
      fontSize: '12px'
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--vp-font-family-mono)',
      lineHeight: '1.65'
    },
    '.cm-content': { padding: '18px 0' },
    '.cm-line': { padding: '0 18px' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--vp-c-text-3)',
      borderRight: '1px solid var(--vp-c-divider)'
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 8px' },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--vp-c-brand-1) 7%, transparent)'
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--vp-c-brand-1)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--vp-c-brand-1) 20%, transparent)'
    }
  });
}
