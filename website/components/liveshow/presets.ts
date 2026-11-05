import type { ViewSpec } from 'visdelta/core';
import { bar } from 'visdelta/bar';
import surveyRows from '../../../data/survey-responses.json' with {type:'json'};

/** Small illustrative dataset: amounts in thousands, not external business data. */
export const sales = [
  { product: 'Atlas', revenue: 84, profit: 22 },
  { product: 'Beacon', revenue: 62, profit: 31 },
  { product: 'Comet', revenue: 96, profit: 18 },
  { product: 'Drift', revenue: 48, profit: 26 },
];
const base = bar({ name: 'sales' }).x('product').y('revenue', { label: 'Revenue ($k)' });
export const initialSpec = base.toSpec();
/** Synthetic Likert counts, deliberately different sample sizes (100/200/80). */
export const surveyResponses = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
export const survey = surveyRows;
const surveyInitial = bar({ name: 'survey' }).x('question').y('count', { label: 'Responses' })
  .breakdown('response', { label: false }).color('response', { domain: surveyResponses, range: ['#b35806', '#f1a340', '#d9d9d9', '#998ec3', '#542788'] }).flip().toSpec();
export const workspaceDatasets = {
  sales: { label: 'Sales', title: 'A different view of sales.', description: 'Four products. Revenue and profit, in thousands of dollars.', source: 'Illustrative sales data', rows: sales, initialSpec },
  survey: { label: 'Survey', title: 'Where do people agree?', description: 'Synthetic five-level survey. Public transport n=100; Parks n=200; Community services n=80.', source: 'Synthetic survey counts · not real respondents', rows: survey, initialSpec: surveyInitial },
} as const;
export type WorkspaceDatasetName = keyof typeof workspaceDatasets;
export function datasetForSpec(spec: ViewSpec) {
  const binding = spec.data as { name?: string } | undefined;
  return binding?.name && Object.hasOwn(workspaceDatasets, binding.name) ? workspaceDatasets[binding.name as WorkspaceDatasetName] : undefined;
}
