import type { Metadata } from 'next';
import Link from 'next/link';
import { IdiomGallery } from '@/components/gallery/idiom-gallery';
import { siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'Visual idioms VisDelta can express, grouped by mark. Every chart is drawn live from a few lines of code and a bundled dataset; open one to see it large, read its code and edit it in the playground.',
  alternates: { canonical: `${siteUrl}/gallery/` },
};

export default function GalleryPage() {
  return (
    <main>
      <IdiomGallery>
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Gallery</h1>
          <p className="mt-2 max-w-2xl text-fd-muted-foreground">
            Every chart here is a few lines of VisDelta on a real dataset. Open one to read its code, or take it to
            the playground and change it.{' '}
            <Link href="/docs/guides/design-comparisons" className="text-fd-foreground underline-offset-4 hover:underline">
              Design comparisons →
            </Link>
          </p>
        </header>
      </IdiomGallery>
    </main>
  );
}
