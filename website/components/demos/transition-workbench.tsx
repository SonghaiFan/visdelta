'use client';

import { useCallback, useState } from 'react';
import { CodeView } from '@/components/interactive/code-view';
import { TransitionPlayer, type Controller } from '@/components/live/transition-player';
import { cn } from '@/lib/cn';

const rows = [
  { category: 'Hardware', sales: 86, profit: 34 },
  { category: 'Software', sales: 64, profit: 49 },
  { category: 'Services', sales: 51, profit: 27 },
  { category: 'Support', sales: 39, profit: 18 },
];

const code = `const base = bar(rows)
  .x("category")
  .y("sales");

const profit = base.y("profit");

const change = await transition(base, profit, {
  target: "#chart"
});

change.progress(0.42);
change.play({ from: 1, to: 0 });`;

type Panel = 'code' | 'delta' | 'spec';

/** A live transition beside the runtime's view of it: code, delta and resolved specs. */
export function TransitionWorkbench() {
  const [panel, setPanel] = useState<Panel>('code');
  const [inspect, setInspect] = useState<{ delta: string; spec: string } | null>(null);

  const load = useCallback(async () => {
    const { bar } = await import('visdelta/bar');
    const base = bar(rows).x('category', { title: 'Category' }).y('sales', { title: 'Revenue' }).tooltip(['category', 'sales']);
    const profit = base.y('profit', { title: 'Profit' }).tooltip(['category', 'profit']);
    return { from: base, to: profit };
  }, []);

  const onReady = useCallback((controller: Controller) => {
    if (!('delta' in controller)) return;
    setInspect({
      delta: JSON.stringify(
        { stateChanges: controller.delta.stateChanges, changed: controller.delta.changed, edits: controller.delta.edits },
        null,
        2,
      ),
      spec: JSON.stringify({ from: controller.from, to: controller.to }, null, 2),
    });
  }, []);

  return (
    <div className="not-prose my-6 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <TransitionPlayer load={load} onReady={onReady} height={290} duration={900} label="Seekable revenue to profit bar transition" className="my-0" />
      <section aria-label="Runtime inspector" className="vd-code-surface flex min-w-0 flex-col overflow-hidden rounded-lg">
        <div role="group" aria-label="Inspector panel" className="flex gap-1 border-b border-white/10 px-2 py-2">
          {(['code', 'delta', 'spec'] as Panel[]).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={panel === name}
              onClick={() => setPanel(name)}
              className={cn('rounded-sm px-2.5 py-1 font-mono text-xs capitalize', panel === name ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white')}
            >
              {name}
            </button>
          ))}
        </div>
        {panel === 'code' ? (
          <CodeView code={code} className="max-h-[22rem]" />
        ) : (
          <pre className="max-h-[22rem] overflow-auto p-4 font-mono text-xs">{inspect ? inspect[panel] : 'Waiting for runtime…'}</pre>
        )}
      </section>
    </div>
  );
}
