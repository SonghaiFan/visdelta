'use client';

import { useCallback, useMemo, useState } from 'react';
import { CodeView } from '@/components/interactive/code-view';
import { TransitionPlayer } from '@/components/live/transition-player';

const parts = ['Core', 'Growth', 'Services', 'Support'];
const rows = ['A', 'B', 'C', 'D'].flatMap((label, i) =>
  parts.map((part, j) => ({
    label,
    part,
    value: [90, 20, 10, 30][j] + [0, -10, -20, -10][i] * (j === 0 ? 1 : 0) + (j === 1 ? i * 5 : 0),
  })),
);
const colors = ['#176078', '#19a4c5', '#2ce5b4', '#00b59c'];

/** Stacked bars → repeated baselines, with live direction and scale controls. */
export function RepeatDemo() {
  const [direction, setDirection] = useState<'y' | 'x' | 'grid'>('y');
  const [scales, setScales] = useState<'shared' | 'independent'>('shared');

  const load = useCallback(async () => {
    const { bar } = await import('visdelta/bar');
    const a = bar(rows)
      .x('label')
      .y('value', { label: 'Units' })
      .key(['label', 'part'])
      .breakdown('part')
      .color('part', { domain: parts, range: colors });
    const b = a.repeat('part', { direction, scales, minWidth: 180 });
    return { from: a, to: b };
  }, [direction, scales]);

  const code = useMemo(
    () => `const a = bar(rows).x("label").y("value", { label: "Units" })
  .key(["label", "part"]).breakdown("part")
  .color("part", { domain: ${JSON.stringify(parts)},
    range: ${JSON.stringify(colors)} });
const b = a.repeat("part", { direction: "${direction}", scales: "${scales}", minWidth: 180 });

const motion = await transition(a, b, { target: "#chart", height: 640 });
motion.play({ from: 0, to: 1, duration: 1200 });`,
    [direction, scales],
  );

  return (
    <div className="not-prose my-6">
      <TransitionPlayer
        load={load}
        height={640}
        duration={1200}
        label="Stacked bars to repeated baselines"
        className="my-0"
        toolbar={
          <>
            <select aria-label="Repeat direction" value={direction} onChange={(event) => setDirection(event.currentTarget.value as typeof direction)} className="h-7 rounded-sm border bg-transparent px-1.5 text-xs">
              <option value="y">Y — rows</option>
              <option value="x">X — columns</option>
              <option value="grid">Grid</option>
            </select>
            <select aria-label="Repeat scales" value={scales} onChange={(event) => setScales(event.currentTarget.value as typeof scales)} className="h-7 rounded-sm border bg-transparent px-1.5 text-xs">
              <option value="shared">Shared scales</option>
              <option value="independent">Independent scales</option>
            </select>
          </>
        }
      />
      {scales === 'independent' && (
        <p className="mt-2 text-sm text-fd-muted-foreground">
          Independent numeric scales emphasize patterns within each panel; bar heights cannot be compared directly across panels.
        </p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer py-1 text-sm text-fd-muted-foreground">Data &amp; runnable transition code</summary>
        <div className="vd-code-surface mt-1 overflow-hidden rounded-lg">
          <CodeView code={`const rows = ${JSON.stringify(rows)};\n\n${code}`} lineNumbers={false} className="max-h-96 px-4" />
        </div>
      </details>
    </div>
  );
}
