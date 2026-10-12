'use client';

import { Upload } from 'lucide-react';
import { useMemo } from 'react';
import { CodeEditor } from '@/components/interactive/code-editor';
import { cn } from '@/lib/cn';
import type { Dataset } from './data';

export type RowsView = 'table' | 'source';

interface RowsPanelProps {
  dataset: Dataset;
  view: RowsView;
  onView: (view: RowsView) => void;
  /** The reader edited the source text. */
  onEdit: (text: string) => void;
  onUpload: (input: HTMLInputElement) => void;
  onRun: () => void;
}

const TABLE_LIMIT = 500;
const cell = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? ''));

/** The rows the code sees as `rows`: a table to read, or the source to edit. */
export function RowsPanel({ dataset, view, onView, onEdit, onUpload, onRun }: RowsPanelProps) {
  const columns = useMemo(() => [...new Set(dataset.rows.slice(0, 50).flatMap((row) => Object.keys(row)))], [dataset.rows]);
  const empty = !dataset.text;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-fd-border/70 px-3 text-xs text-fd-muted-foreground">
        <span className="font-mono tabular-nums">
          {dataset.rows.length} records · {columns.length} fields
        </span>
        {!empty && (
          <div role="group" aria-label="Rows view" className="flex overflow-hidden rounded-sm border">
            {(['table', 'source'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => onView(option)}
                className={cn(
                  'px-2 py-0.5 transition-colors',
                  view === option ? 'bg-fd-foreground text-fd-background' : 'hover:bg-fd-accent hover:text-fd-foreground',
                )}
              >
                {option === 'table' ? 'Table' : dataset.format.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 hover:text-fd-foreground">
          <Upload aria-hidden="true" className="size-3.5" />
          Upload
          <input type="file" accept=".csv,.json" className="sr-only" aria-label="Use your own CSV or JSON rows" onChange={(event) => onUpload(event.currentTarget)} />
        </label>
      </div>
      {empty ? (
        <p className="p-4 text-sm text-fd-muted-foreground">
          This chart declares its data inline in the code. Upload a CSV or JSON file to give the code <code className="font-mono">rows</code>.
        </p>
      ) : view === 'source' ? (
        <CodeEditor
          className="min-h-0 flex-1"
          value={dataset.text}
          onChange={onEdit}
          onRun={onRun}
          language="plain"
          lineNumbers
          ariaLabel="Rows source"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full whitespace-nowrap text-left font-mono text-[0.7rem] tabular-nums">
            <thead className="sticky top-0 bg-[var(--code-bg)]">
              <tr>
                <th className="w-0 px-3 py-2 text-right font-normal text-[var(--code-muted)]" aria-label="Row" />
                {columns.map((field) => (
                  <th key={field} className="px-3 py-2 font-medium text-fd-muted-foreground">
                    {field}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.rows.slice(0, TABLE_LIMIT).map((row, index) => (
                <tr key={index} className="border-t border-fd-border/60">
                  <td className="px-3 py-1 text-right text-[var(--code-muted)]">{index + 1}</td>
                  {columns.map((field) => (
                    <td key={field} className="px-3 py-1">
                      {cell(row[field])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {dataset.rows.length > TABLE_LIMIT && (
            <p className="px-3 py-2 text-xs text-fd-muted-foreground">
              Showing {TABLE_LIMIT} of {dataset.rows.length} records. Open {dataset.format.toUpperCase()} to see them all.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
