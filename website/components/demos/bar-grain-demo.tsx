'use client';

import { useCallback, useState } from 'react';
import { CodeView } from '@/components/interactive/code-view';
import { TransitionPlayer } from '@/components/live/transition-player';

const rows = [
  { state: 'California', age: 'Under 18', population: 8.8 },
  { state: 'California', age: '18–64', population: 25.4 },
  { state: 'California', age: '65+', population: 5.8 },
  { state: 'Texas', age: 'Under 18', population: 5.7 },
  { state: 'Texas', age: '18–64', population: 14.8 },
  { state: 'Texas', age: '65+', population: 3.6 },
  { state: 'Florida', age: 'Under 18', population: 4.2 },
  { state: 'Florida', age: '18–64', population: 14.2 },
  { state: 'Florida', age: '65+', population: 5.1 },
];

const fromCode = `const from = bar(rows).x('state', { label: 'State' })
  .y('population', { label: 'People (millions)' })
  .rollup({ label: 'People (millions)' });`;
const toCode = `const to = bar(rows).x('state', { label: 'State' })
  .y('population', { label: 'People (millions)' })
  .breakdown('age', { label: 'People (millions)' })
  .layout('grouped')
  .color('#3366ff');`;

/** The Bar declaration planner's route, shown next to the transition it drives. */
export function BarGrainDemo() {
  const [plan, setPlan] = useState<{ stages: number; text: string } | null>(null);

  const load = useCallback(async () => {
    const [{ bar, createBarGrainDeclarationOperationCodec }, { planDeclarationTransition }] = await Promise.all([
      import('visdelta/bar'),
      import('visdelta/core'),
    ]);
    const from = bar(rows).x('state', { label: 'State' }).y('population', { label: 'People (millions)' }).rollup({ label: 'People (millions)' });
    const to = bar(rows)
      .x('state', { label: 'State' })
      .y('population', { label: 'People (millions)' })
      .breakdown('age', { label: 'People (millions)' })
      .layout('grouped')
      .color('#3366ff');
    const result = planDeclarationTransition(from.toSpec(), to.toSpec(), createBarGrainDeclarationOperationCodec());
    if (result.status !== 'planned') throw new Error(`Bar Grain route unavailable: ${result.reason}`);
    setPlan({
      stages: result.stages.length,
      text: JSON.stringify(
        { status: result.status, stages: result.stages.map((stage) => ({ operation: stage.operation.id, completeState: stage.to })) },
        null,
        2,
      ),
    });
    return { from, to };
  }, []);

  return (
    <div className="not-prose my-6">
      <p className="mb-2 text-sm">
        <strong>Total → grouped detail + colour.</strong>{' '}
        <span className="text-fd-muted-foreground">Illustrative population values for demonstration only.</span>
      </p>
      <TransitionPlayer load={load} height={320} duration={900} label="Live Bar Grain transition" className="my-0" />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {[
          ['From', fromCode],
          ['To', toCode],
        ].map(([title, code]) => (
          <div key={title} className="vd-code-surface overflow-hidden rounded-lg">
            <p className="px-4 pt-3 font-mono text-[0.62rem] uppercase tracking-wider" style={{ color: 'var(--code-muted)' }}>
              {title}
            </p>
            <CodeView code={code} lineNumbers={false} className="px-4 pt-1" />
          </div>
        ))}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer py-1 text-sm text-fd-muted-foreground">
          Planner path · {plan ? `${plan.stages} complete stage${plan.stages === 1 ? '' : 's'}` : 'computing…'}
        </summary>
        <pre className="vd-code-surface mt-1 max-h-96 overflow-auto rounded-lg p-4 font-mono text-xs">{plan?.text ?? 'Waiting for the planner…'}</pre>
      </details>
    </div>
  );
}
