import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import { categories, registry } from '@/examples/registry';
import { codeThemes } from '@/lib/code-themes';
import { getExampleSource } from '@/lib/example-source';
import { PlaygroundClient } from './playground-client';

/**
 * Server half of the playground: highlights every example's source at build
 * time, so the browser receives HTML instead of a syntax highlighter.
 */
export async function Playground() {
  const sources = Object.fromEntries(
    await Promise.all(
      registry.map(async (example) => [
        example.id,
        <ServerCodeBlock
          key={example.id}
          code={await getExampleSource(example.id)}
          lang="ts"
          themes={codeThemes}
          codeblock={{ title: `${example.id}.ts`, className: 'my-0' }}
        />,
      ]),
    ),
  );

  return <PlaygroundClient examples={registry} categories={categories} sources={sources} />;
}
