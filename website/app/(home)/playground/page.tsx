import type { Metadata } from 'next';
import { Playground } from '@/components/playground/playground';
import { siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  title: 'Playground',
  description: 'Two chart states and the transition between them. Edit either one and the chart follows.',
  alternates: { canonical: `${siteUrl}/playground/` },
};

export default function PlaygroundPage() {
  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pt-10 pb-20 sm:px-8 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Playground</h1>
      <p className="mt-2 mb-8 text-fd-muted-foreground">Two states. Edit either one; the chart follows.</p>
      <Playground />
    </main>
  );
}
