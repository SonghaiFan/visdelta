import { BarState } from './authoring.js';
import type { BarViewState } from './authoring.js';
import type { FluentEdit } from '../../fluent-edits.js';
import { cloneState } from '../../grammar/view-state.js';
import { deepEqual } from '../../grammar/declaration-operations.js';
import { specObjectKey, specScopes } from '../../spec-meta.js';
import { createBarGrainDeclarationOperationCodec } from './declaration-operations.js';

const codec = createBarGrainDeclarationOperationCodec();
function valid(spec: BarViewState) {
  const result = codec.validate(spec);
  if (result.status !== 'ok') throw new Error(`Unsupported Bar edit: ${result.reason}`);
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Rehydrate authored slots; only renderer-proven derived identity is reconstructed. */
export function editBar(source: BarViewState, calls: readonly FluentEdit[], resolved: BarViewState): BarViewState {
  const normalized = codec.normalize(resolved);
  if (normalized.status !== 'ok') throw new Error(`Unsupported Bar edit: ${normalized.reason}`);
  // The codec reconstructs derived identity; resolved channels retain inferred types.
  const baseline = { ...cloneState(source), encoding: cloneState(resolved.encoding), meta: cloneState(normalized.value.meta) };
  const state = cloneState(baseline);
  const key = specObjectKey(state);
  if (key) state.key = key;
  const scopes = Object.fromEntries(Object.entries(specScopes(state)).filter(([, value]) => value != null));
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
  for (const { method, args } of calls) {
    const fail = () => { throw new Error(`Unsupported Bar edit or arguments: ${method}.`); };
    switch (method) {
      case 'flip':
        if (args.length) fail();
        builder = builder.flip(); break;
      case 'color':
        if (args.length !== 1 || typeof args[0] !== 'string' || !args[0]) fail();
        builder = builder.color(args[0] as string); break;
      case 'x': case 'y': {
        if (aggregate || args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]) fail();
        const options = args[1] ?? {};
        if (!object(options) || Object.keys(options).some(key => !['type', 'label', 'format'].includes(key))
          || Object.values(options).some(value => typeof value !== 'string')) fail();
        builder = method === 'x' ? builder.x(args[0] as string, options) : builder.y(args[0] as string, options); break;
      }
      case 'where': case 'focus': case 'highlight':
        if (args.length !== 1 || !object(args[0]) || !Object.keys(args[0]).length) fail();
        builder = method === 'where' ? builder.where(args[0] as Record<string, unknown>)
          : method === 'focus' ? builder.focus(args[0] as Record<string, unknown>) : builder.highlight(args[0] as Record<string, unknown>); break;
      case 'sort':
        if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]
          || (args[1] !== undefined && args[1] !== 'ascending' && args[1] !== 'descending')) fail();
        builder = builder.sort(args[0] as string, args[1] as 'ascending' | 'descending' | undefined); break;
      default: fail();
    }
  }
  const candidate = materialize(builder);
  if (!aggregate && candidate.meta?.object) {
    // Source validation proved this identity was derived from its axis bindings.
    delete candidate.meta.object.semantic;
    const normalized = codec.normalize({ ...candidate, data: resolved.data });
    if (normalized.status !== 'ok') throw new Error(`Unsupported Bar edit: ${normalized.reason}`);
    candidate.meta = normalized.value.meta;
  }
  valid({ ...candidate, data: resolved.data });
  return candidate;
}
