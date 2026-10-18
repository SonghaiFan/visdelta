import type { Metadata } from 'next';
import { Liveshow } from '@/components/liveshow/liveshow';
import { siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  title: 'Liveshow',
  description: 'Send small fluent JSON edits to an existing chart. Explore agent-style updates, animation and the latest-update policy.',
  alternates: { canonical: `${siteUrl}/liveshow/` },
};

export default function LiveshowPage() {
  return <main className="min-w-0 flex-1"><Liveshow /></main>;
}
