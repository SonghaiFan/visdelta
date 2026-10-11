import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { absoluteUrl } from '@/lib/shared';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/playground'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/gallery'), changeFrequency: 'weekly', priority: 0.8 },
    ...source.getPages().map((page) => ({
      url: absoluteUrl(page.url),
      changeFrequency: 'weekly' as const,
      priority: page.slugs.length === 0 ? 0.9 : 0.7,
    })),
  ];
}
