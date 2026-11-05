import { distributionOptions, distributionRows } from './layout/distribution.js';
import type { BarLayout, BarLayoutOptions } from '../../types/index.js';
import { inspectBarSpec } from './inspect.js';
import { editColor, editSelector } from '../common-edits.js';
import { chartError, editFailure } from '../../edit-errors.js';
import { BarState } from './authoring.js';
import type { BarViewState } from './authoring.js';
import type { FluentEdit } from '../../fluent-edits.js';
import { cloneState } from '../../grammar/view-state.js';
import { deepEqual } from '../../grammar/declaration-operations.js';
import { specObjectKey, specScopes, specState } from '../../spec-meta.js';
import { createBarGrainDeclarationOperationCodec } from './declaration-operations.js';

const codec = createBarGrainDeclarationOperationCodec();
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Rehydrate authored slots; only renderer-proven derived identity is reconstructed. */
export function editBar(source: BarViewState, calls: readonly FluentEdit[], resolved: BarViewState): BarViewState {
  // Planning coverage is not an edit permission boundary.
  const normalized = codec.normalize(resolved);
  // The codec reconstructs derived identity; resolved channels retain inferred types.
  const baseline = { ...cloneState(source), encoding: cloneState(resolved.encoding), meta: cloneState(normalized.status === 'ok' ? normalized.value.meta : source.meta) };
  const state = cloneState(baseline);
  const key = specObjectKey(state);
  if (key) state.key = key;
  const scopes = { ...cloneState(specState(state).scopes),
    ...Object.fromEntries(Object.entries(specScopes(state)).filter(([, value]) => value != null)) };
  if (Object.keys(scopes).length) state.scopes = cloneState(scopes);
  let builder = new BarState(state);
  const materialize = (value: BarState) => {
    const spec = value.toSpec();
    if (!specObjectKey(baseline) && spec.meta?.object) delete spec.meta.object.key;
    if (source.margin !== undefined) spec.margin = cloneState(source.margin);
    return spec;
  };
  // Unsupported authored forms must not be silently simplified by rehydration.
  if (!deepEqual(materialize(builder), baseline)) throw new Error('This Bar declaration cannot round-trip through fluent editing. Use update() with a complete state.');
  const aggregate = (source.transform ?? []).some(item => 'aggregate' in item);
  for (const [editIndex, { method, args }] of calls.entries()) {
    try {
      const rows = builder.data(resolved.data).rows();
      const requireField = (field: string) => {
        if (rows.length && !rows.some(row => Object.prototype.hasOwnProperty.call(row, field))) throw chartError('MISSING_FIELD',
          `Field "${field}" is not available at this transform stage.`,
          'Use an aggregate output field, or author a source filter before aggregation in a complete state.', {chartType:'bar', method});
      };
      const fail = () => { throw chartError('INVALID_EDIT_ARGUMENTS', `Unsupported Bar edit or arguments: ${method}.`, 'Check the documented arguments and transformed fields.', { chartType: 'bar', method }); };
      switch (method) {
        case 'layout':
          assertLayoutArgs(args);
          if (!inspectBarSpec(builder.toSpec()).segmentField) fail();
          builder = builder.layout(args[0] as BarLayout, (args[1] ?? {}) as BarLayoutOptions); break;
        case 'flip':
          if (args.length) fail();
          builder = builder.flip(); break;
        case 'color':
          { const color = editColor(args, 'bar');
            const field = typeof color === 'string' ? (color.startsWith('#') ? undefined : color) : color.field;
            if (field) requireField(field);
            builder = builder.color(color); break; }
        case 'x': case 'y': {
          if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]) fail();
          const options = args[1] ?? {};
          if (!object(options) || Object.keys(options).some(key => !['type', 'label', 'format'].includes(key))
            || Object.values(options).some(value => typeof value !== 'string')) fail();
          requireField(args[0] as string);
          const previous = builder.toSpec().encoding?.[method];
          const channelOptions = previous?.field === args[0] ? {...previous, ...options} : options;
          builder = method === 'x' ? builder.x(args[0] as string, channelOptions) : builder.y(args[0] as string, channelOptions); break;
        }
        case 'where': case 'focus': case 'highlight':
          if (method === 'highlight' && args.length === 1 && args[0] === null) { builder = builder.highlight(null); break; }
          if (args.length !== 1 || !object(args[0]) || !Object.keys(args[0]).length) fail();
          for (const filter of editSelector(args[0] as Record<string, unknown>)) requireField(filter.field);
          builder = method === 'where' ? builder.where(args[0] as Record<string, unknown>)
            : method === 'focus' ? builder.focus(args[0] as Record<string, unknown>) : builder.highlight(args[0] as Record<string, unknown>); break;
        case 'sort':
          if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]
            || (args[1] !== undefined && args[1] !== 'ascending' && args[1] !== 'descending')) fail();
          requireField(args[0] as string);
          builder = builder.sort(args[0] as string, args[1] as 'ascending' | 'descending' | undefined); break;
        default: fail();
      }
      // Each call sees the preceding canonical state (including a completed flip).
      builder = rehydrate(materialize(builder));
    } catch (error) { throw editFailure(error, editIndex, method, source.mark); }
  }
  const candidate = materialize(builder);
  if (!aggregate && normalized.status === 'ok' && candidate.meta?.object) {
    delete candidate.meta.object.semantic;
    const result = codec.normalize({ ...candidate, data: resolved.data });
    if (result.status !== 'ok') throw new Error(`Unsupported Bar edit: ${result.reason}`);
    candidate.meta = result.value.meta;
  }
  // Validate the completed batch, including filtered distribution membership.
  try {
    const facts = inspectBarSpec(candidate);
    if (facts.status !== 'known') throw chartError('INVALID_EDIT_STATE', facts.diagnostics[0]!.message,
      'Keep one categorical axis and one quantitative axis with consistent layout bindings.', {chartType:'bar'});
    const rows = new BarState(candidate).data(resolved.data).rows();
    for (const channel of Object.values(candidate.encoding ?? {})) {
      for (const entry of Array.isArray(channel) ? channel : [channel]) {
        if (entry?.field && rows.length && !rows.some(row => Object.prototype.hasOwnProperty.call(row, entry.field!)))
          throw chartError('MISSING_FIELD', `Field "${entry.field}" is not available in the candidate rows.`, 'Use transformed output fields.', {chartType:'bar'});
      }
    }
    const distribution = distributionOptions(candidate);
    if (distribution) distributionRows(rows, facts.categoryField!, facts.segmentField!, facts.measureField!, facts.layout!, distribution);
    if (normalized.status === 'ok' && !distribution) {
      const result = codec.validate({...candidate, data: resolved.data});
      if (result.status !== 'ok') throw new Error(`Unsupported Bar edit: ${result.reason}`);
    }
  } catch (error) { throw editFailure(error, calls.length - 1, calls[calls.length - 1]!.method, source.mark); }

  return candidate;
}

/** Restore authored slots without dropping explicit null attention states. */
function rehydrate(source: BarViewState): BarState {
  const state = cloneState(source);
  const key = specObjectKey(state);
  if (key) state.key = key;
  const scopes = {...cloneState(specState(state).scopes),
    ...Object.fromEntries(Object.entries(specScopes(state)).filter(([, value]) => value != null))};
  if (Object.keys(scopes).length) state.scopes = scopes;
  return new BarState(state);
}

function assertLayoutArgs(args: readonly unknown[]): void {
  if (args.length < 1 || args.length > 2 || !['grouped', 'stacked', 'diverging'].includes(String(args[0]))
    || (args[1] !== undefined && (!object(args[1]) || Object.keys(args[1]).some(key => !['normalize', 'segments', 'negative', 'neutral', 'positive'].includes(key))))) {
    throw chartError('INVALID_EDIT_ARGUMENTS', 'layout expects grouped, stacked or diverging with optional distribution options.',
      'Use {method:"layout",args:["grouped"]} or args:["stacked"].', { chartType: 'bar', method: 'layout' });
  }
}
