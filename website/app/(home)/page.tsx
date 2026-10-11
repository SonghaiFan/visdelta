import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { HeroDemo } from '@/components/home/hero-demo';
import { categories } from '@/examples/registry';
import { appDescription, libraryVersion, siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  alternates: { canonical: `${siteUrl}/` },
};

const pipeline = ['Data', 'Chart state', 'Difference', 'Transition', 'Frame', 'Control'];

const principles = [
  {
    title: 'Two states',
    body: 'Describe the chart before and after as immutable declarations. Chaining returns a new state; nothing renders or mutates.',
  },
  {
    title: 'One transition',
    body: 'VisDelta matches marks, plans a route and keeps marks, scales, ticks and titles in agreement at every frame.',
  },
  {
    title: 'Any frame',
    body: 'progress(t) is the whole interface. Buttons, sliders, scroll and timelines drive the same frames forward or backward.',
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 sm:px-6">
      <section className="grid gap-10 pt-14 pb-12 sm:pt-20">
        <div className="max-w-3xl">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-fd-muted-foreground">
            VisDelta {libraryVersion} · MIT
          </p>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-balance sm:text-6xl">
            Change the state.
            <br />
            The chart follows.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-fd-muted-foreground text-pretty">
            {appDescription}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/docs/quick-start"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-fd-foreground px-4 text-sm font-medium text-fd-background transition-opacity hover:opacity-85"
            >
              Quick start <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/docs/examples/playground"
              className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-fd-accent"
            >
              Open the playground
            </Link>
            <code className="hidden h-10 items-center rounded-md border bg-fd-card px-3 font-mono text-sm sm:inline-flex">
              npm install visdelta
            </code>
          </div>
        </div>
        <HeroDemo />
      </section>

      <section aria-labelledby="pipeline-title" className="border-t py-12">
        <h2 id="pipeline-title" className="sr-only">
          How VisDelta works
        </h2>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-sm">
          {pipeline.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="rounded-sm border bg-fd-card px-2 py-1">{step}</span>
              {index < pipeline.length - 1 && (
                <span aria-hidden="true" className="text-fd-muted-foreground">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {principles.map((item) => (
            <div key={item.title}>
              <h3 className="font-semibold tracking-tight">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="categories-title" className="border-t py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="categories-title" className="text-2xl font-semibold tracking-tight">
            Seven categories name every change
          </h2>
          <Link href="/docs/concepts/state-changes" className="text-sm text-fd-primary hover:underline">
            Read about state changes →
          </Link>
        </div>
        <ul className="mt-6 grid gap-px overflow-hidden rounded-lg border bg-fd-border sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.id} data-category={category.id} className="bg-fd-background p-4">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <span className="vd-category-dot" aria-hidden="true" />
                {category.label}
              </span>
              <p className="mt-1.5 text-sm text-fd-muted-foreground">{category.summary}</p>
            </li>
          ))}
          <li className="bg-fd-background p-4">
            <Link href="/docs/examples/playground" className="text-sm font-medium text-fd-primary hover:underline">
              Try every category →
            </Link>
            <p className="mt-1.5 text-sm text-fd-muted-foreground">Twenty live examples across six chart types.</p>
          </li>
        </ul>
      </section>

      <section aria-labelledby="next-title" className="border-t pt-12">
        <h2 id="next-title" className="sr-only">
          Where to go next
        </h2>
        <div className="grid gap-px overflow-hidden rounded-lg border bg-fd-border sm:grid-cols-3">
          {[
            { href: '/docs', label: 'Documentation', body: 'Concepts, chart types and guides.' },
            { href: '/docs/api', label: 'API reference', body: 'Every entry point, option and type.' },
            { href: '/docs/guides/react', label: 'Use with React', body: 'Mount, control and clean up a transition.' },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="group bg-fd-background p-5 transition-colors hover:bg-fd-card">
              <span className="flex items-center justify-between font-medium">
                {item.label}
                <ArrowRight className="size-4 text-fd-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm text-fd-muted-foreground">{item.body}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
