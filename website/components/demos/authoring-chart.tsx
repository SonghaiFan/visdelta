'use client';

import { Chart } from 'visdelta/react';
import { chart, data } from './authoring-comparison-data';
import { ExampleErrorBoundary } from '@/components/live/error-boundary';

export function AuthoringChart() {
  return (
    <ExampleErrorBoundary name="Three ways to write one chart">
      <Chart state={chart} data={data} height={280}
        className="vd-docs-chart rounded-sm border"
        role="img" aria-label="Sales: A 12, B 28, C 19" />
    </ExampleErrorBoundary>
  );
}
