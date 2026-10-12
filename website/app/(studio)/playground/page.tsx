import type { Metadata } from 'next';
import { Playground } from '@/components/playground/playground';
import { siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  title: 'Playground',
  description: 'An online editor for VisDelta: write a chart and watch it change. Every valid edit is a transition; keep keyframes and replay them.',
  alternates: { canonical: `${siteUrl}/playground/` },
};

export default function PlaygroundPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <Playground />
    </main>
  );
}
