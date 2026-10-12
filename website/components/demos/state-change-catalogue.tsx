import Link from 'next/link';
import { StateChangeIcon } from '@/components/interactive/state-change-icon';
import { playgroundDemos } from '@/components/playground/demos';
import type { StateChangeCategory } from '@/examples/registry';

/**
 * The closed vocabulary of `delta().stateChanges`. "Public syntax" lists builder
 * calls that commonly produce a category; "Emitted actions" are the exact
 * values in the `StateChange` union (src/types/index.ts).
 */
const catalogue: { id: StateChangeCategory; name: string; question: string; syntax: string[]; actions: string[]; targets?: string[] }[] = [
  {
    id: 'data',
    name: 'Data',
    question: 'Which source records participate, and did their values change?',
    syntax: ['.data()', '.where()'],
    actions: ['add', 'remove', 'update'],
  },
  {
    id: 'grain',
    name: 'Grain',
    question: 'Which records make one mark, and how is its measure calculated?',
    syntax: ['.rollup()', '.breakdown()', 'Unit .value()'],
    actions: ['split', 'merge', 'reaggregate', 'change-reducer'],
  },
  {
    id: 'encoding',
    name: 'Encoding',
    question: 'Which data field is bound to which visual channel?',
    syntax: ['.x()', '.y()', '.color()', '.size()', '.repeat()'],
    actions: ['bind', 'unbind', 'remap'],
  },
  {
    id: 'coordinate',
    name: 'Coordinate',
    question: 'How are values mapped into position and space?',
    syntax: ['.flip()', '{ domain }', '{ scale }'],
    actions: ['rescale', 'reorient'],
  },
  {
    id: 'layout',
    name: 'Layout',
    question: 'How are the same objects arranged or connected?',
    syntax: ['.layout()', '.sort()', '.connect()'],
    actions: ['reorder', 'rearrange', 'reconnect'],
  },
  {
    id: 'attention',
    name: 'Attention',
    question: 'Which objects are emphasized or framed by the camera?',
    syntax: ['.focus()', '.highlight()'],
    actions: ['enter', 'exit', 'shift'],
    targets: ['focus', 'highlight'],
  },
  {
    id: 'appearance',
    name: 'Appearance',
    question: 'What fixed visual form or styling is used?',
    syntax: ['.color("#…")', '.title()', '.strokeWidth()', '.curve()'],
    actions: ['restyle', 'reshape'],
  },
];

export function StateChangeCatalogue() {
  return (
    <ol className="not-prose my-8 border-t" aria-label="Seven state-change categories">
      {catalogue.map((category) => {
        const tryIt = `/playground#${playgroundDemos.find((demo) => demo.category === category.id)!.id}`;
        return (
          <li key={category.id} data-category={category.id} className="grid gap-x-6 gap-y-2 border-b py-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <div className="flex items-center gap-2.5">
              <span className="vd-category-icon" aria-hidden="true">
                <StateChangeIcon category={category.id} />
              </span>
              <h3 className="font-semibold tracking-tight">{category.name}</h3>
              <Link
                href={tryIt}
                aria-label={`Try ${category.name} in the playground`}
                className="ml-auto text-sm text-fd-muted-foreground underline-offset-4 hover:text-fd-foreground hover:underline sm:hidden"
              >
                Try it →
              </Link>
            </div>
            <div className="min-w-0">
              <p className="flex items-baseline gap-4 text-fd-muted-foreground">
                <span>{category.question}</span>
                <Link
                  href={tryIt}
                  aria-label={`Try ${category.name} in the playground`}
                  className="ml-auto hidden shrink-0 text-sm underline-offset-4 hover:text-fd-foreground hover:underline sm:inline"
                >
                  Try it →
                </Link>
              </p>
              <p className="mt-2 font-mono text-xs leading-relaxed">
                <span className="text-fd-muted-foreground">writes </span>
                {category.syntax.join('  ')}
                <span className="ml-4 text-fd-muted-foreground">reports </span>
                <span className="text-[var(--color-delta)]">Δ</span> {category.actions.join(' · ')}
                {category.targets && <span className="text-fd-muted-foreground"> ({category.targets.join(' | ')})</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
