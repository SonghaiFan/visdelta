import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { stringifySpec } from 'visdelta/core';
import { sales, chart } from './authoring-comparison-data';
import { codeThemes } from '@/lib/code-themes';
import { AuthoringChart } from './authoring-chart';

const json = stringifySpec(chart, 2);
const dataCode = `const sales = [\n${sales.map(row => `  ${JSON.stringify(row)}`).join(',\n')}\n];`;
const declaration = "bar({ name: 'sales' }).x('category').y('value')";
const mount = "const view = await transition(chart, chart, {\n  target: '#chart', data: { sales }, height: 280,\n});\n// Call view.destroy() when removing the chart.";

function Code({ code, lang = 'ts' }: { code: string; lang?: string }) {
  return <ServerCodeBlock code={code} lang={lang} themes={codeThemes} />;
}

/** One data source, one result, and three copyable ways to render it. */
export function AuthoringComparison() {
  return (
    <section aria-label="Chart authoring comparison" className="my-6 min-w-0">
      <p>All three examples use the same data. Import <code>visdelta/style.css</code> once in your app.</p>
      <Code code={dataCode} />
      <Tabs items={['Chain API', 'JSON spec', 'React']}>
        <Tab value="Chain API">
          <Code code={`import { bar } from 'visdelta/bar';\nimport { transition } from 'visdelta/transition';\n\nconst chart = ${declaration};\n\n${mount}`} />
          <p>The host is an existing <code>{'<div id="chart"></div>'}</code>. Equal endpoints render a static chart.</p>
        </Tab>
        <Tab value="JSON spec">
          <Code code={json} lang="json" />
          <Code code={`import { render } from 'visdelta';\n\nconst view = await render('#chart', json, {\n  data: { sales }, height: 280,\n});\n\n// Each complete chart spec from your agent:\nawait view.update(nextSpec);\n\n// When removing the chart:\nview.destroy();`} />
          <p>Use the same <code>#chart</code> host. The spec names the dataset; <code>data</code> supplies its rows.</p>
        </Tab>
        <Tab value="React">
          <Code lang="tsx" code={`import { bar } from 'visdelta/bar';\nimport { Chart } from 'visdelta/react';\n\nconst chart = ${declaration};\nconst data = { sales };\n\nexport function SalesChart() {\n  return <Chart state={chart} data={data} height={280} />;\n}`} />
          <p>React owns the host and cleanup. <code>state</code> also accepts the parsed JSON spec, with its module registered.</p>
        </Tab>
      </Tabs>
      <div className="not-prose mt-4"><AuthoringChart /></div>
    </section>
  );
}
