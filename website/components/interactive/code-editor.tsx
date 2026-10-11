'use client';

import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** ⌘/Ctrl + Enter. */
  onRun?: () => void;
  ariaLabel: string;
  className?: string;
}

/**
 * A quiet CodeMirror 6 editor, loaded on demand. It follows the site theme
 * through the `--code-*` tokens. The editor is uncontrolled while typing; an
 * external `value` replaces the document only when it differs.
 */
export function CodeEditor({ value, onChange, onRun, ariaLabel, className }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const applying = useRef(false);
  const callbacks = useRef({ onChange, onRun });
  const initialValue = useRef(value);

  useEffect(() => {
    callbacks.current = { onChange, onRun };
  }, [onChange, onRun]);

  useEffect(() => {
    let destroyed = false;
    (async () => {
      const [{ minimalSetup }, { EditorView: View, keymap }, { javascript }, language, { tags }, { closeBrackets }] =
        await Promise.all([
          import('codemirror'),
          import('@codemirror/view'),
          import('@codemirror/lang-javascript'),
          import('@codemirror/language'),
          import('@lezer/highlight'),
          import('@codemirror/autocomplete'),
        ]);
      if (destroyed || !hostRef.current) return;
      const view = new View({
        doc: initialValue.current,
        parent: hostRef.current,
        extensions: [
          minimalSetup,
          closeBrackets(),
          language.bracketMatching(),
          language.indentOnInput(),
          javascript(),
          View.lineWrapping,
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                callbacks.current.onRun?.();
                return true;
              },
            },
          ]),
          language.syntaxHighlighting(
            language.HighlightStyle.define([
              { tag: tags.keyword, color: 'var(--code-keyword)' },
              { tag: [tags.string, tags.regexp], color: 'var(--code-string)' },
              { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
              { tag: tags.comment, color: 'var(--code-muted)', fontStyle: 'italic' },
              { tag: [tags.punctuation, tags.bracket, tags.separator], color: 'var(--code-muted)' },
            ]),
          ),
          View.theme({
            '&': { color: 'var(--code-text)', backgroundColor: 'transparent', fontSize: '12.5px' },
            '&.cm-focused': { outline: 'none' },
            '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7' },
            '.cm-content': { padding: '12px 0', caretColor: 'var(--color-delta)' },
            '.cm-line': { padding: '0 16px' },
            '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-delta)', borderLeftWidth: '2px' },
            '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
              backgroundColor: 'color-mix(in srgb, var(--color-delta) 28%, transparent) !important',
            },
            '.cm-matchingBracket': { backgroundColor: 'transparent', outline: '1px solid var(--code-muted)' },
          }),
          View.contentAttributes.of({ 'aria-label': ariaLabel, 'aria-multiline': 'true', spellcheck: 'false' }),
          View.updateListener.of((update) => {
            if (update.docChanged && !applying.current) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      });
      viewRef.current = view;
    })();
    return () => {
      destroyed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      initialValue.current = value;
      return;
    }
    if (value === view.state.doc.toString()) return;
    applying.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    applying.current = false;
  }, [value]);

  return <div ref={hostRef} className={className} data-code-editor="" />;
}
