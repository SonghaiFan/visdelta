import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import { getExample } from '@/examples/registry';
import { codeThemes } from '@/lib/code-themes';
import { getExampleSource } from '@/lib/example-source';
import { HeroDemoClient, type HeroDemo as Demo } from './hero-demo-client';

const DEMO_IDS = ['bar-split', 'line-split', 'area-stream', 'point-remap', 'unit-layout', 'pie-donut'];

export async function HeroDemo() {
  const demos: Demo[] = DEMO_IDS.map((id) => {
    const meta = getExample(id);
    return { id, chart: meta.chart, caption: meta.description };
  });
  const sources = Object.fromEntries(
    await Promise.all(
      DEMO_IDS.map(async (id) => [
        id,
        <ServerCodeBlock
          key={id}
          code={await getExampleSource(id)}
          lang="ts"
          themes={codeThemes}
          codeblock={{ title: `${id}.ts` }}
        />,
      ]),
    ),
  );
  return <HeroDemoClient demos={demos} sources={sources} />;
}
