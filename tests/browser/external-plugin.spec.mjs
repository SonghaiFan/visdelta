import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

test('independently bundled public plugin shares host motion and supports seeking and disposal', async ({ page }) => {
  // Bundle the plugin with its own SDK copy: renderer tracks must still belong
  // to the host runtime, supplied by createRenderer(runtime).
  const bundle = await build({
    entryPoints: ['examples/plugins/orbit/index.js'], bundle: true,
    format: 'iife', globalName: 'OrbitExample', write: false
  });
  await page.goto('/tests/fixtures/isolated.html');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const { transition } = await import('/dist/transition-entry.js');
    const { registerChartModule, defineChartStyle } = await import('/dist/plugins.js');
    const { orbit, orbitModule } = window.OrbitExample;
    const rows = [{ id: 'a', first: 25, next: 100 }, { id: 'b', first: 36, next: 144 }];
    const from = orbit(rows).size('first');
    const to = from.size('next');
    const style = defineChartStyle({ key: 'external', plot: { margin: { left: 37 } } });
    const pair = await transition(from, to, { target: '#chart', chartStyle: style });
    const radii = () => [...document.querySelectorAll('.orbit-mark')].map(n => +n.getAttribute('r'));
    const start = radii();
    pair.progress(0.5); const middle = radii();
    pair.progress(1); const end = radii();
    pair.progress(0.5); const rewind = radii();
    pair.resize(); const resized = radii();
    pair.destroy();
    const disposed = document.querySelectorAll('.orbit-mark, .vd-tooltip').length;
    registerChartModule(orbitModule);
    const jsonPair = await transition(from.toSpec(), to.toSpec(), { target: '#chart' });
    jsonPair.progress(1); const jsonEnd = radii();
    jsonPair.destroy();
    return { start, middle, end, rewind, resized, disposed, jsonEnd, margin: style.plot.margin.left };
  });
  expect(result.start).toEqual([5, 6]);
  expect(result.end).toEqual([10, 12]);
  expect(result.middle[0]).toBeGreaterThan(5);
  expect(result.middle[0]).toBeLessThan(10);
  expect(result.rewind).toEqual(result.middle);
  expect(result.resized).toEqual(result.middle);
  expect(result.jsonEnd).toEqual(result.end);
  expect(result.disposed).toBe(0);
  expect(result.margin).toBe(37);
});
