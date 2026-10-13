'use client';

import { useEffect, useRef, useState } from 'react';
import type { VisualizationSequence } from 'visdelta/transition';
import { CodeView } from '@/components/interactive/code-view';
import { Scrubber } from '@/components/interactive/scrubber';
import { cn } from '@/lib/cn';

const products = [
  { product: 'Hardware', revenue: 42, profit: 9 },
  { product: 'Software', revenue: 31, profit: 17 },
  { product: 'Cloud', revenue: 27, profit: 14 },
  { product: 'Services', revenue: 36, profit: 8 },
  { product: 'Support', revenue: 18, profit: 6 },
  { product: 'Training', revenue: 12, profit: 5 },
];

const steps = [
  { title: 'Revenue by product.', body: 'One state: data, mappings, nothing else.', code: 'const a = bar(rows).x("product").y("revenue");' },
  { title: 'Show profit instead.', body: 'One line changes. The bars, the axis and its title move as one.', code: 'const b = a.y("profit");' },
  { title: 'Rank it.', body: 'The same bars, in a new order. No data changes.', code: 'const c = b.sort("profit", "descending");' },
  { title: 'Point at two of them.', body: 'Nothing leaves the chart. Only attention moves.', code: 'const d = c.highlight({ product: ["Software", "Cloud"] });' },
];

/**
 * Scroll is a timeline. Scroll position drives `sequence().progress()`
 * directly, so reading forward and back plays the same frames both ways.
 */
export function ScrollStory() {
  const chartRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const storyRef = useRef<VisualizationSequence | null>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const target = chartRef.current;
    if (!target) return;
    let cancelled = false;
    let frame = 0;

    const position = () => {
      const centre = window.innerHeight * 0.55;
      const middles = stepRefs.current.map((step) => {
        const box = step!.getBoundingClientRect();
        return box.top + box.height / 2;
      });
      if (centre <= middles[0]) return 0;
      for (let index = 0; index < middles.length - 1; index += 1) {
        if (centre <= middles[index + 1]) return index + (centre - middles[index]) / (middles[index + 1] - middles[index]);
      }
      return middles.length - 1;
    };
    const update = () => {
      frame = 0;
      const next = position();
      storyRef.current?.progress(next);
      setValue(next);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    (async () => {
      const [{ bar }, { sequence }] = await Promise.all([import('visdelta/bar'), import('visdelta/transition')]);
      const a = bar(products).x('product', { label: 'Product' }).y('revenue', { label: 'Revenue ($M)' }).key('product');
      const b = a.y('profit', { label: 'Profit ($M)' });
      const c = b.sort('profit', 'descending');
      const d = c.highlight({ product: ['Software', 'Cloud'] });
      const story = await sequence([a, b, c, d], { target, height: window.innerWidth < 640 ? 260 : 360 });
      if (cancelled) return story.destroy();
      storyRef.current = story;
      update();
    })();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const observer = new ResizeObserver(() => storyRef.current?.resize());
    observer.observe(target);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      observer.disconnect();
      storyRef.current?.destroy();
      storyRef.current = null;
    };
  }, []);

  const active = Math.round(value);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <ol className="order-2 lg:order-1">
        {steps.map((step, index) => (
          <li
            key={step.title}
            ref={(element) => {
              stepRefs.current[index] = element;
            }}
            className={cn(
              'flex min-h-[62vh] flex-col justify-center transition-opacity duration-500 first:min-h-[40vh] last:min-h-[70vh]',
              index === active ? 'opacity-100' : 'opacity-30',
            )}
          >
            <span className="vd-label">{String(index + 1).padStart(2, '0')}</span>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 max-w-sm text-fd-muted-foreground">{step.body}</p>
            <div className="vd-code-surface mt-4 max-w-md overflow-hidden rounded-md">
              <CodeView code={step.code} lineNumbers={false} className="py-2.5" />
            </div>
          </li>
        ))}
      </ol>
      <div className="sticky top-14 z-10 order-1 self-start bg-fd-background pt-3 pb-1 lg:top-24 lg:order-2 lg:pt-0">
        <div ref={chartRef} className="vd-docs-chart min-h-[260px] sm:min-h-[360px]" aria-label="Chart driven by scroll position" />
        <Scrubber value={value} max={steps.length - 1} onChange={() => {}} disabled label="Scroll position" className="pointer-events-none mt-1" />
      </div>
    </div>
  );
}
