import { isDeepStrictEqual } from 'node:util';
import { bar, inspectBarSpec } from 'visdelta/bar';
import { pie } from 'visdelta/pie';
import { line } from 'visdelta/line';
import { area } from 'visdelta/area';
import { point } from 'visdelta/point';
import { unit } from 'visdelta/unit';
import { parseSpec } from 'visdelta/core';
import { readFileSync } from 'node:fs';

// Read the installed package's generated documentation, never a maintained copy.
const index=JSON.parse(readFileSync(new URL(import.meta.resolve('visdelta/docs/index.json')),'utf8'));
const sections=index.documents.filter(document=>document.source).flatMap(document=>
  readFileSync(new URL(import.meta.resolve(document.path)),'utf8').split(/(?=^#{1,4} )/m)
    .map((text,index)=>({id:`${document.path}:${index}`,title:text.split('\n')[0],text,source:document.path})));
const examples = [bar, line, area, point, unit].map(factory => factory({ name: 'sales' }).x('product', { type: 'ordinal' }).y('revenue').toSpec());
examples.push(pie({ name: 'sales' }).value('revenue').label('product').toSpec());
export function searchDocs(query) {
  const terms = query.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  if (!terms.length) return { version: index.packageVersion, sections: [], hint: 'Search English API names, such as line, pie, ViewSpec, filter, color.' };
  const ranked = sections.map(section => ({ ...section, score: terms.reduce((sum, term) => sum + (section.title.toLowerCase().includes(term) ? 8 : 0) + (section.text.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter(section => section.score).sort((a, b) => b.score - a.score).slice(0, 4);
  return { version: index.packageVersion, source: 'Installed VisDelta public documentation', examples: examples.filter(spec => terms.includes(spec.mark)), sections: ranked.map(({ id, title, text, source }) => ({ id, title, source, text: text.slice(0, 6500), truncated: text.length > 6500 })) };
}
export const chartTypes = ['area', 'bar', 'line', 'pie', 'point', 'unit'];
export function authorChart(spec, binding = { name: 'sales' }, sourceRows) {
  const supplied = spec?.data;
  const inlineRows = Array.isArray(supplied) ? supplied : supplied?.values;
  if (supplied !== undefined && !isDeepStrictEqual(supplied, binding) && !(sourceRows && isDeepStrictEqual(inlineRows, sourceRows))) {
    throw new Error('Keep the current dataset: omit data or use the existing named binding. Supplied inline rows must exactly match sourceRows. Put filtering in transform, not data.values.');
  }
  const target = parseSpec(JSON.stringify({ ...spec, data: binding }));
  if (!chartTypes.includes(target.mark)) throw new Error(`Registered chart modules: ${chartTypes.join(', ')}.`);
  return target;
}
/** Facts from public bindings, not the model's prior prose or source-row order. */
export function describeChart(spec) {
  if (spec.mark !== 'bar') return { mark: spec.mark };
  const facts = inspectBarSpec(spec);
  return { mark: 'bar', ...facts, detailField: facts.segmentField,
    evidence: facts.status === 'known' ? `Accepted declaration: ${facts.orientation} ${facts.layout} Bar, series ${facts.segmentField ?? 'none'}.` : facts.diagnostics.map(d => `${d.path}: ${d.message}`).join('; ') };
}
