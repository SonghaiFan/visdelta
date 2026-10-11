import type { Metadata } from 'next';
import { Playground } from '@/components/playground/playground';
import { siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  title: 'Playground',
  description: 'Write a VisDelta chart and watch it change. Every valid edit is a transition; keep keyframes and replay them.',
  alternates: { canonical: `${siteUrl}/playground/` },
};

export default function PlaygroundPage() {
  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pt-10 pb-20 sm:px-8 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Playground</h1>
      <p className="mt-2 mb-8 text-fd-muted-foreground">Every valid edit is a transition. Keep the moments you like as keyframes.</p>
      <Playground />
    </main>
  );
}
