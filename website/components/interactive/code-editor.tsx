'use client';

import { useEffect, useRef } from 'react';
import type { StateEffectType } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** ⌘/Ctrl + Enter. */
  onRun?: () => void;
  /** ⌘/Ctrl + S. */
  onSave?: () => void;
  /** 1-based line numbers to mark as changed. */
  markedLines?: readonly number[];
  ariaLabel: string;
  className?: string;
}

/**
 * A quiet CodeMirror 6 editor, loaded on demand. It follows the site theme
 * through the `--code-*` tokens. The editor is uncontrolled while typing; an
 * external `value` is applied as the smallest edit that produces it, with the
 * cursor at the end of that edit, so code written by the page reads as typing.
 */
export function CodeEditor({ value, onChange, onRun, onSave, markedLines, ariaLabel, className }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const markRef = useRef<StateEffectType<readonly number[]> | null>(null);
  const applying = useRef(false);
  const callbacks = useRef({ onChange, onRun, onSave });
  const initialValue = useRef(value);
  const marks = useRef<readonly number[]>(markedLines ?? []);

  useEffect(() => {
    callbacks.current = { onChange, onRun, onSave };
  }, [onChange, onRun, onSave]);

  useEffect(() => {
    let destroyed = false;
    (async () => {
      const [
        { minimalSetup },
        { EditorView: View, Decoration, keymap },
        { StateEffect, StateField, RangeSetBuilder },
        { javascript },
        language,
        { tags },
        { closeBrackets },
      ] = await Promise.all([
        import('codemirror'),
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('@codemirror/lang-javascript'),
        import('@codemirror/language'),
        import('@lezer/highlight'),
        import('@codemirror/autocomplete'),
      ]);
      if (destroyed || !hostRef.current) return;
      const setMarks = StateEffect.define<readonly number[]>();
      const marked = Decoration.line({ class: 'cm-vd-marked' });
      const markField = StateField.define({
        create: () => Decoration.none,
        update(decorations, transaction) {
          decorations = decorations.map(transaction.changes);
          for (const effect of transaction.effects) {
            if (!effect.is(setMarks)) continue;
            const builder = new RangeSetBuilder<typeof marked>();
            const { doc } = transaction.state;
            for (const line of [...new Set(effect.value)].sort((a, b) => a - b)) {
              if (line >= 1 && line <= doc.lines) builder.add(doc.line(line).from, doc.line(line).from, marked);
            }
            decorations = builder.finish();
          }
          return decorations;
        },
        provide: (field) => View.decorations.from(field),
      });
      markRef.current = setMarks;
      const view = new View({
        doc: initialValue.current,
        parent: hostRef.current,
        extensions: [
          minimalSetup,
          markField,
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
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                callbacks.current.onSave?.();
                return Boolean(callbacks.current.onSave);
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
            '.cm-line.cm-vd-marked': {
              backgroundColor: 'color-mix(in srgb, var(--color-delta) 12%, transparent)',
              boxShadow: 'inset 2px 0 0 var(--color-delta)',
            },
          }),
          View.contentAttributes.of({ 'aria-label': ariaLabel, 'aria-multiline': 'true', spellcheck: 'false' }),
          View.updateListener.of((update) => {
            if (update.docChanged && !applying.current) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      });
      viewRef.current = view;
      view.dispatch({ effects: setMarks.of(marks.current) });
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
    const current = view.state.doc.toString();
    if (value === current) return;
    let start = 0;
    while (start < current.length && start < value.length && current[start] === value[start]) start += 1;
    let end = 0;
    while (end < current.length - start && end < value.length - start && current[current.length - 1 - end] === value[value.length - 1 - end]) end += 1;
    const insert = value.slice(start, value.length - end);
    applying.current = true;
    view.dispatch({
      changes: { from: start, to: current.length - end, insert },
      selection: { anchor: start + insert.length },
      scrollIntoView: true,
    });
    applying.current = false;
  }, [value]);

  useEffect(() => {
    marks.current = markedLines ?? [];
    if (viewRef.current && markRef.current) viewRef.current.dispatch({ effects: markRef.current.of(marks.current) });
  }, [markedLines]);

  return <div ref={hostRef} className={className} data-code-editor="" />;
}
