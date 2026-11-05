import test from 'node:test';
import assert from 'node:assert/strict';
import { BarState } from 'visdelta/bar';
import { workspaceDatasets, surveyResponses } from '../../website/components/liveshow/presets.ts';
import { validatePlan } from '../../website/server/liveshow/ai.mjs';

// Layout is not a permission gate. The public module must validate the actual
// candidate, including complete response groups and its percentage denominator.
for (const layout of ['stacked', 'percent', 'diverging']) {
 const builder = new BarState(workspaceDatasets.survey.initialSpec);
 const spec = layout === 'percent' ? builder.layout('stacked', { normalize: 'percent', segments: surveyResponses }).toSpec()
  : layout === 'diverging' ? builder.layout('diverging', { negative: surveyResponses.slice(0, 2), neutral: 'Neutral', positive: surveyResponses.slice(3), normalize: 'percent' }).toSpec()
  : builder.toSpec();
 const cases = {
  color: [{ method: 'color', args: ['#d97706'] }],
  focus: [{ method: 'focus', args: [{ question: 'Parks' }] }],
  sort: [{ method: 'sort', args: ['question', 'descending'] }],
  wholeQuestionFilter: [{ method: 'where', args: [{ question: 'Parks' }] }],
  axisLabel: [{ method: 'x', args: ['count', { label: 'Responses' }] }],
  compoundAttention: [{ method: 'color', args: ['#d97706'] }, { method: 'highlight', args: [{ response: 'Strongly agree' }] }],
  flipAndHighlight: [{ method: 'flip', args: [] }, { method: 'highlight', args: [{ response: 'Strongly agree' }] }],
 };
 for (const [operation, edits] of Object.entries(cases)) test(`${layout}: ${operation} is validated by semantics instead of blocked by layout`, async () => {
  const before = structuredClone(spec);
  const result = await validatePlan({ explanation: operation, edits }, { spec, revision: 0 }, true);
  assert.ok(result.targetSpec); assert.deepEqual(spec, before);
  assert.deepEqual(result.targetSpec.data, spec.data);
  assert.deepEqual(result.targetSpec.meta.object, spec.meta.object);
  if (operation !== 'wholeQuestionFilter') assert.deepEqual(result.targetSpec.transform, (operation === 'sort' ? new BarState(spec).sort('question', 'descending').toSpec() : spec).transform);
 });
}

test('releasing layout gates does not silently drop declared response categories', async () => {
 const spec = new BarState(workspaceDatasets.survey.initialSpec).layout('stacked', { normalize: 'percent', segments: surveyResponses }).toSpec();
 const before = structuredClone(spec);
 await assert.rejects(() => validatePlan({ explanation: 'Invalid partial distribution', edits: [{ method: 'where', args: [{ response: 'Strongly agree' }] }] }, { spec, revision: 0 }, true));
 assert.deepEqual(spec, before);
});
