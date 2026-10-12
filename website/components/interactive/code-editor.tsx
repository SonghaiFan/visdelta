'use client';

import { useEffect, useRef } from 'react';
import type { StateEffectType } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/** Completions the editor offers; each is read when the reader asks. */
export interface CodeHints {
  /** After a dot: methods of the chain being written. */
  members(): string[];
  /** Inside a string literal, such as field names. */
  strings(): string[];
  /** Bare identifiers in scope. */
  names(): string[];
}

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
  /** JavaScript (default) or plain text such as CSV. */
  language?: 'javascript' | 'plain';
  /** A line-number gutter and the active line, as in a full editor. */
  lineNumbers?: boolean;
  hints?: CodeHints;
  /** The caret moved: 1-based line and column. */
  onCursor?: (line: number, column: number) => void;
}

/**
 * A quiet CodeMirror 6 editor, loaded on demand. It follows the site theme
 * through the `--code-*` tokens. The editor is uncontrolled while typing; an
 * external `value` is applied as the smallest edit that produces it, with the
 * cursor at the end of that edit, so code written by the page reads as typing.
 */
export function CodeEditor({
  value,
  onChange,
  onRun,
  onSave,
  markedLines,
  ariaLabel,
  className,
  language: mode = 'javascript',
  lineNumbers = false,
  hints,
  onCursor,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const markRef = useRef<StateEffectType<readonly number[]> | null>(null);
  const applying = useRef(false);
  const callbacks = useRef({ onChange, onRun, onSave, hints, onCursor });
  const initialValue = useRef(value);
  const marks = useRef<readonly number[]>(markedLines ?? []);

  useEffect(() => {
    callbacks.current = { onChange, onRun, onSave, hints, onCursor };
  }, [onChange, onRun, onSave, hints, onCursor]);

  useEffect(() => {
    let destroyed = false;
    (async () => {
      const [
        { minimalSetup },
        { EditorView: View, Decoration, keymap, lineNumbers: gutter, highlightActiveLine, highlightActiveLineGutter },
        { StateEffect, StateField, RangeSetBuilder, Prec },
        { javascript },
        language,
        { tags },
        { closeBrackets, autocompletion },
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
      /** Methods after a dot, fields inside strings, and names elsewhere. */
      const complete = (context: import('@codemirror/autocomplete').CompletionContext) => {
        const source = callbacks.current.hints;
        if (!source) return null;
        const node = language.syntaxTree(context.state).resolveInner(context.pos, -1);
        if (/Comment/.test(node.name)) return null;
        if (node.name === 'String') {
          const from = node.from + 1;
          if (context.pos < from) return null;
          return {
            from,
            options: source.strings().map((label) => ({ label, type: 'text', detail: 'field' })),
            validFor: /^[^"'`\\]*$/,
          };
        }
        const member = context.matchBefore(/\.[\w$]*/);
        if (member) {
          return {
            from: member.from + 1,
            options: source.members().map((label) => ({ label, type: 'method' })),
            validFor: /^[\w$]*$/,
          };
        }
        const word = context.matchBefore(/[\w$]+/);
        if (!word && !context.explicit) return null;
        return {
          from: word?.from ?? context.pos,
          options: source.names().map((label) => ({ label, type: 'variable' })),
          validFor: /^[\w$]*$/,
        };
      };
      const editing =
        mode === 'javascript'
          ? [closeBrackets(), language.bracketMatching(), language.indentOnInput(), javascript(), autocompletion({ override: [complete], icons: false })]
          : [];
      const gutters = lineNumbers ? [gutter(), highlightActiveLineGutter(), highlightActiveLine()] : [];
      const view = new View({
        doc: initialValue.current,
        parent: hostRef.current,
        extensions: [
          minimalSetup,
          markField,
          ...editing,
          ...gutters,
          View.lineWrapping,
          // Ahead of the default keymap, which binds Mod-Enter to a blank line.
          Prec.highest(keymap.of([
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
          ])),
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
            '.cm-gutters': {
              backgroundColor: 'transparent',
              color: 'var(--code-muted)',
              border: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
            },
            '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 14px', minWidth: '34px', lineHeight: '21.25px' },
            '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--code-text)' },
            '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--code-text) 4%, transparent)' },
            '.cm-tooltip': {
              border: '1px solid var(--color-fd-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--color-fd-popover)',
              color: 'var(--color-fd-popover-foreground)',
              overflow: 'hidden',
            },
            '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', fontSize: '12px', maxHeight: '14em' },
            '.cm-tooltip-autocomplete > ul > li': { padding: '2px 10px' },
            '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
              backgroundColor: 'color-mix(in srgb, var(--color-delta) 22%, transparent)',
              color: 'inherit',
            },
            '.cm-completionDetail': { marginLeft: '1em', fontStyle: 'normal', color: 'var(--code-muted)' },
            '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '600' },
            '.cm-line.cm-vd-marked': {
              backgroundColor: 'color-mix(in srgb, var(--color-delta) 12%, transparent)',
              boxShadow: 'inset 2px 0 0 var(--color-delta)',
            },
          }),
          View.contentAttributes.of({ 'aria-label': ariaLabel, 'aria-multiline': 'true', spellcheck: 'false' }),
          View.updateListener.of((update) => {
            if (update.docChanged && !applying.current) callbacks.current.onChange(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              callbacks.current.onCursor?.(line.number, head - line.from + 1);
            }
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
    // The extension set is fixed for the editor's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
