import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartRuntime } from '../dist/runtime/chart-runtime.js';
import { resolveChartPresentation, d3ChartStyle, paperChartStyle, darkChartStyle } from '../dist/charts/style.js';
import { barPresentation } from '../dist/charts/bar/style.js';

const rows = [{ x: 'A', y: 10, group: 'North' }, { x: 'B', y: 30, group: 'South' }];
const channels = { x: { field: 'x', title: 'Category' }, y: { field: 'y', title: 'Value', type: 'quantitative' } };
const local = { plot: { margin: { top: 56, right: 20, bottom: 40, left: 56 }, edgeTitles: true } };

test('the default D3 bar presentation keeps categorical x ticks without their domain line', () => {
  assert.equal(resolveChartPresentation(barPresentation, d3ChartStyle).plot.openXDomain, true);
  assert.equal(resolveChartPresentation(barPresentation, paperChartStyle).plot.openXDomain, false);
});

for (const theme of [d3ChartStyle, paperChartStyle, darkChartStyle]) {
  test(`${theme.key}: layout allocates content without mutating theme or text size`, () => {
    const runtime = createChartRuntime({ chartStyle: theme });
    const { plot } = resolveChartPresentation(local, theme);
    const before = JSON.stringify(plot);
    const layout = (width, height, encoding = channels, data = rows) => runtime.layoutMargins(encoding, { width, height, rows: data }, plot);
    const small = layout(240, 240), wide = layout(800, 240), tall = layout(240, 800);
    assert.ok(small.left + small.right < 100);
    assert.ok(small.top + small.bottom < 100);
    assert.equal(wide.top, small.top);
    assert.equal(tall.left, small.left);
    assert.ok(wide.left >= small.left);
    const withLegend = { ...channels, color: { field: 'group', type: 'nominal' } };
    assert.ok(layout(240, 240, withLegend).top >= small.top);
    if (theme === paperChartStyle) {
      assert.ok(layout(800, 240, withLegend).right > wide.right);
      assert.equal(layout(240, 240, withLegend).right, small.right);
    }
    const long = layout(800, 240, { ...channels, y: { field: 'x', title: 'Place' } }, [{ x: 'A long category name' }]);
    assert.ok(long.left > wide.left);
    assert.equal(JSON.stringify(plot), before);
  });
}
