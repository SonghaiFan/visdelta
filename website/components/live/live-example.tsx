import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import { getExample } from '@/examples/registry';
import { getExampleSource } from '@/lib/example-source';
import { codeThemes } from '@/lib/code-themes';
import { ExampleErrorBoundary } from './error-boundary';
import { TransitionPlayer, type TransitionPlayerProps } from './transition-player';

export interface LiveExampleProps extends Omit<TransitionPlayerProps, 'example'> {
  /** Example id from `examples/registry.ts`. */
  id: string;
  /** Show the copyable source below the chart. */
  code?: boolean;
}

/**
 * A live transition with its exact source. The chart and the code come from
 * the same module in `examples/`, so they cannot drift apart.
 */
export async function LiveExample({ id, code = true, height, ...props }: LiveExampleProps) {
  const meta = getExample(id);
  const source = code ? await getExampleSource(id) : null;

  return (
    <div className="not-prose my-6">
      <ExampleErrorBoundary name={meta.title}>
        <TransitionPlayer
          example={id}
          height={height ?? meta.height}
          label={`${meta.title}: ${meta.description}`}
          className="mb-0"
          {...props}
        />
      </ExampleErrorBoundary>
      {source && (
        <ServerCodeBlock
          code={source}
          lang="ts"
          themes={codeThemes}
          codeblock={{ title: `${id}.ts`, className: 'mt-2 mb-0' }}
        />
      )}
    </div>
  );
}
