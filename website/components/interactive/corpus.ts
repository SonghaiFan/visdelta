/**
 * Typed access to example corpora kept beside the previous VitePress site. The
 * library's tests check the design comparisons, so the site imports both in
 * place instead of keeping copies:
 *
 * - docs/.vitepress/components/galleryIdioms.js       gallery idioms
 * - docs/.vitepress/components/designComparisons.js  "Not ideal → Better" pairs
 */

export type LabChart = 'bar' | 'line' | 'area' | 'point' | 'unit';

export interface Idiom {
  id: string;
  mark: LabChart;
  title: string;
  note: string;
  data: string;
  code: string;
}

export interface IdiomGroup {
  mark: LabChart;
  title: string;
  summary: string;
}

export async function loadIdioms(): Promise<{
  idioms: Idiom[];
  idiomGroups: IdiomGroup[];
  datasetName: (url: string) => string;
}> {
  return (await import('@repo/docs/.vitepress/components/galleryIdioms.js')) as never;
}
