import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const TOKEN =
  /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|await|return|new|async|function|true|false|null)\b|(\b\d+(?:\.\d+)?\b)|(\.?[A-Za-z_$][\w$]*)(?=\s*\()/g;

/** A deliberately small JavaScript highlighter for short, generated snippets. */
function highlightLine(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(line.slice(last, index));
    const [text, comment, string, keyword, number, call] = match;
    const kind = comment ? 'muted' : string ? 'string' : keyword ? 'keyword' : number ? 'number' : call ? 'function' : null;
    parts.push(
      <span key={index} style={{ color: `var(--code-${kind})` }}>
        {text}
      </span>,
    );
    last = index + text.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

interface CodeViewProps {
  code: string;
  /** Zero-based line to mark as just changed. */
  highlightedLine?: number;
  lineNumbers?: boolean;
  className?: string;
}

/** Read-only code on the dark code surface, with an optional highlighted line. */
export function CodeView({ code, highlightedLine = -1, lineNumbers = true, className }: CodeViewProps) {
  return (
    <pre className={cn('vd-code-view', className)}>
      <code>
        {code.split('\n').map((line, index) => (
          <Fragment key={index}>
            <span className="vd-code-line" data-changed={index === highlightedLine ? '' : undefined}>
              {lineNumbers && <span className="vd-code-gutter">{index + 1}</span>}
              <span>{highlightLine(line)}</span>
            </span>
            {'\n'}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}
