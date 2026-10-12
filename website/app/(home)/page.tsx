import Link from 'next/link';
import type { Metadata } from 'next';
import { CodePipeline } from '@/components/home/code-pipeline';
import { ScrollStory } from '@/components/home/scroll-story';
import { libraryVersion, repositoryUrl, siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  alternates: { canonical: `${siteUrl}/` },
};

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
      <section className="pt-20 pb-16 sm:pt-28">
        <h1 className="text-[clamp(3rem,9vw,6.75rem)] font-semibold leading-[0.92] tracking-[-0.05em]">
          Chart change,
          <br />
          animated.
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-fd-muted-foreground text-pretty sm:text-xl">
          Write two states of a chart. VisDelta works out what changed and draws every frame in between —
          forward, backward, or wherever you scroll.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Link
            href="/docs/quick-start"
            className="inline-flex h-11 items-center rounded-full bg-fd-foreground px-6 text-sm font-medium text-fd-background transition-opacity hover:opacity-85"
          >
            Get started
          </Link>
          <Link href="/playground" className="text-sm font-medium underline-offset-4 hover:underline">
            Open the playground →
          </Link>
          <code className="font-mono text-sm text-fd-muted-foreground">npm i visdelta</code>
        </div>
      </section>

      <section aria-label="Code drives the chart" className="pb-28">
        <CodePipeline />
      </section>

      <section aria-labelledby="scroll-title" className="border-t pt-20 pb-10">
        <p className="vd-label">Progress is just a number</p>
        <h2 id="scroll-title" className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          Scroll is a timeline.
        </h2>
        <p className="mt-4 max-w-xl text-fd-muted-foreground">
          Keep scrolling. Your scroll position is the progress, so reading back up plays the same frames in
          reverse.
        </p>
        <div className="mt-6">
          <ScrollStory />
        </div>
      </section>

      <section aria-labelledby="ideas-title" className="border-t py-20">
        <h2 id="ideas-title" className="sr-only">
          The idea
        </h2>
        <dl className="grid gap-10 sm:grid-cols-3">
          {[
            ['Two states', 'Describe the chart before and after. States are plain, immutable values.'],
            ['One transition', 'VisDelta matches the marks and plans a route where every frame is a real chart.'],
            ['Any frame', 'Play it, reverse it, or seek straight to progress 0.42. Your code decides when.'],
          ].map(([term, description]) => (
            <div key={term}>
              <dt className="font-semibold tracking-tight">{term}</dt>
              <dd className="mt-2 text-fd-muted-foreground">{description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-t py-10 text-sm">
        <Link href="/docs" className="hover:underline">
          Documentation
        </Link>
        <Link href="/playground" className="hover:underline">
          Playground
        </Link>
        <Link href="/gallery" className="hover:underline">
          Gallery
        </Link>
        <a href={repositoryUrl} className="hover:underline">
          GitHub
        </a>
        <span className="ml-auto font-mono text-xs text-fd-muted-foreground">v{libraryVersion} · MIT</span>
      </footer>
    </main>
  );
}
