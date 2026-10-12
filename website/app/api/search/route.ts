import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const revalidate = false;

// Exported once at build time and queried in the browser (see components/search.tsx).
export const { staticGET: GET } = createFromSource(source, {
  language: 'english',
});
