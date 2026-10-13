/** Typed access to the interactive examples authored with the Fumadocs site. */

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
  return (await import('./gallery-idioms.js')) as never;
}
