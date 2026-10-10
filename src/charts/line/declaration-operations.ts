import { createDeclarationOperationCodec, createStandardDeclarationOperationCodec, deepEqual, validateCanonicalAttentionScopes, validateCanonicalEncoding, validateExplicitSourceDatumIdentity } from '../../grammar/declaration-operations.js';
import { validateCanonicalPositionDomains } from '../../grammar/declaration-domains.js';
import { serializeViewSpec, specScopes } from '../../spec-meta.js';
import { applyTransforms } from '../../data/transforms.js';
import { resolveSpecDataTypes } from '../../data/types.js';
import { normalizeFilter } from '../../data/filter.js';
import { isD3CurveName } from './curve.js';
import { lineState, lineSeriesKey } from './state.js';
import type { DeclarationCodecResult, DeclarationOperationCodec, AggregateTransform, ViewSpec } from '../../types/index.js';
import type { LineViewState } from './authoring.js';

const ROOT = '__visdeltaLineTopology';
const allowedRoots = new Set(['mark', 'data', 'encoding', 'transform', 'meta', 'key', 'datumKey', 'margin', 'curve', 'connect', 'strokeWidth', 'pointSize']);
const reducers = new Set(['sum', 'count', 'mean', 'min', 'max', 'median']);
type Topology = { detail: Record<string, unknown> | null; aggregate: AggregateTransform | null };
const fail = <T>(reason: string): DeclarationCodecResult<T> => ({ status: 'unsupported', reason });

/** A breakdown/rollup is one declaration; its derived y binding and identity travel together. */
export function createLineDeclarationOperationCodec(): DeclarationOperationCodec<LineViewState> {
  const ordinaryValidator = createStandardDeclarationOperationCodec<LineViewState>({
    mark: 'line', requiredChannels: ['x', 'y'], allowedChannels: ['x', 'y', 'color', 'tooltip', 'key'],
    allowedRoots: [...allowedRoots], validate: spec => validateLine(spec, true) ?? undefined
  });
  const ordinary = createDeclarationOperationCodec<LineViewState>({
    allowedRoots: [...allowedRoots], atomicPaths: [['margin']], normalize: value => { normalizeLineDefaults(value); prune(value); return value; },
    validate: value => { const result = ordinaryValidator.validate(value); return result.status === 'unsupported' ? result.reason : undefined; }
  });
  const shadowCodec = createDeclarationOperationCodec<ViewSpec>({
    allowedRoots: ['mark', 'data', 'encoding', 'transform', 'meta', 'key', 'datumKey', 'margin', 'curve', 'connect', 'strokeWidth', 'pointSize', ROOT],
    atomicPaths: [['margin'], [ROOT], ['meta', 'state', 'sceneState', 'axis']],
    derivedPaths: [['meta', 'object']],
    normalize: value => { prune(value); return value; }
  });
  const codec: DeclarationOperationCodec<LineViewState> = {
    supportsTransition(from, to) {
      if (isOrdinary(from) !== isOrdinary(to)) return 'Line explicit detail transitions retain the native chart route';
      if (Boolean(topology(from).aggregate) !== Boolean(topology(to).aggregate)) return 'Line raw/summary transitions retain the native chart route';
      if (lineState(from, from.encoding).flipped !== lineState(to, to.encoding).flipped && !deepEqual(topology(from), topology(to))) {
        return 'Line topology planning does not combine reorientation with breakdown or rollup';
      }
    },
    normalize(spec) {
      if (isOrdinary(spec)) return ordinary.normalize(spec);
      const reason = validateLine(spec);
      return reason ? fail(reason) : { status: 'ok', value: normalizeLine(spec) };
    },
    validate(spec) { if (isOrdinary(spec)) return ordinary.validate(spec); const reason = validateLine(spec); return reason ? fail(reason) : { status: 'ok', value: undefined }; },
    decompose(spec) {
      if (isOrdinary(spec)) return ordinary.decompose(spec);
      const reason = validateLine(spec);
      return reason ? fail(reason) : shadowCodec.decompose(toShadow(normalizeLine(spec)));
    },
    evaluate(template, operations) {
      if (isOrdinary(template)) return ordinary.evaluate(template, operations);
      const result = shadowCodec.evaluate(toShadow(normalizeLine(template)), operations);
      if (result.status !== 'ok') return result;
      const candidate = fromShadow(result.value);
      const reason = validateLine(candidate);
      if (reason) return fail(reason);
      const normalized = normalizeLine(candidate);
      const roundTrip = shadowCodec.decompose(toShadow(normalized));
      if (roundTrip.status !== 'ok' || !deepEqual(roundTrip.value, operations)) return fail('Line topology operations do not round-trip');
      return { status: 'ok', value: normalized };
    }
  };
  return codec;
}

function isOrdinary(spec: LineViewState): boolean {
  return !(spec.transform ?? []).some(item => 'aggregate' in item) && !serializeViewSpec(spec).meta?.state?.sceneState;
}
function topology(spec: LineViewState): Topology {
  const serialized = serializeViewSpec(spec);
  const detail = serialized.meta?.state?.sceneState?.detail as Record<string, unknown> | undefined;
  const aggregate = (serialized.transform ?? []).find(item => 'aggregate' in item) as { aggregate: AggregateTransform } | undefined;
  return { detail: detail ? { ...detail } : null, aggregate: aggregate?.aggregate ?? null };
}
function toShadow(spec: LineViewState): ViewSpec {
  const value = serializeViewSpec(spec) as ViewSpec & Record<string, unknown>;
  value[ROOT] = topology(spec);
  value.transform = (value.transform ?? []).filter(item => !('aggregate' in item));
  if (topology(spec).aggregate && value.encoding?.y) {
    const y = { ...value.encoding.y }; delete y.field; value.encoding.y = y;
  }
  if (value.meta?.state?.sceneState) delete value.meta.state.sceneState.detail;
  if (value.meta) delete value.meta.object;
  // Empty metadata is removed consistently by normalizeLine, not retained as an operation.
  prune(value);
  return value;
}
function fromShadow(shadow: ViewSpec): LineViewState {
  const value = serializeViewSpec(shadow) as ViewSpec & Record<string, unknown>;
  const slot = value[ROOT] as Topology | undefined;
  delete value[ROOT];
  if (!slot) return value as LineViewState;
  if (slot.aggregate) {
    const measure = slot.aggregate.fields?.[0];
    value.encoding = { ...value.encoding, y: { ...value.encoding?.y, field: measure?.as } };
    value.transform = [...(value.transform ?? []), { aggregate: slot.aggregate }];
  }
  if (slot.detail) {
    value.meta = { ...value.meta, state: { ...value.meta?.state, sceneState: { ...value.meta?.state?.sceneState, detail: slot.detail } } };
  }
  return normalizeLine(value as LineViewState);
}
function normalizeLine(spec: LineViewState): LineViewState {
  const value = serializeViewSpec(spec) as LineViewState;
  normalizeLineDefaults(value);
  const x = value.encoding?.x?.field;
  const series = lineSeriesKey(lineState(value, value.encoding));
  if (x) value.meta = { ...value.meta, object: { ...value.meta?.object, key: series ? [x, series] : x } };
  prune(value);
  return value;
}
function normalizeLineDefaults(value: LineViewState) {
  // lineState and the renderer both interpret an omitted connection as adjacent.
  if (value.connect === 'adjacent') delete value.connect;
  if (value.curve === 'curveLinear') delete value.curve;
}
function prune(value: ViewSpec) {
  if (value.transform?.length === 0) delete value.transform;
  const scopes = value.meta?.state?.scopes;
  if (scopes && !Object.keys(scopes).length) delete value.meta!.state!.scopes;
  const scene = value.meta?.state?.sceneState;
  if (scene && !Object.keys(scene).length) delete value.meta!.state!.sceneState;
  if (value.meta?.state && !Object.keys(value.meta.state).length) delete value.meta.state;
  if (value.meta?.object && !Object.keys(value.meta.object).length) delete value.meta.object;
  if (value.meta && !Object.keys(value.meta).length) delete value.meta;
}

function validateLine(spec: LineViewState, ordinary = false): string | null {
  try { return validateLineDeclaration(spec, ordinary); } catch (error) { return error instanceof Error ? error.message : 'invalid Line declaration'; }
}
function validateLineDeclaration(spec: LineViewState, ordinary: boolean): string | null {
  if (Object.keys(spec).some(key => !allowedRoots.has(key))) return 'unsupported Line declaration field';
  if (spec.mark !== 'line') return 'declaration is not a Line';
  const serialized = serializeViewSpec(spec);
  const encodingError = validateCanonicalEncoding(serialized, ['x', 'y', 'color', 'tooltip', 'key']);
  if (encodingError) return encodingError;
  const x = serialized.encoding?.x?.field;
  const y = serialized.encoding?.y?.field;
  if (!x || !y) return 'Line requires complete x and y bindings';
  const yType = serialized.encoding?.y?.type;
  if (yType !== undefined && yType !== 'quantitative') return 'Line requires a quantitative y measure';
  const domains = validateCanonicalPositionDomains(serialized);
  if (domains) return domains;
  const identity = validateExplicitSourceDatumIdentity(serialized);
  if (identity) return identity;
  const attention = validateCanonicalAttentionScopes(serialized);
  if (attention) return attention;
  if (spec.curve !== undefined && !isD3CurveName(spec.curve)) return 'unsupported Line curve';
  if (spec.connect !== undefined && spec.connect !== 'adjacent' && spec.connect !== 'across') return 'unsupported Line connection';
  if (spec.strokeWidth !== undefined && (!Number.isFinite(spec.strokeWidth) || spec.strokeWidth <= 0)) return 'invalid Line stroke width';
  if (spec.pointSize !== undefined && (!Number.isFinite(spec.pointSize) || spec.pointSize < 0)) return 'invalid Line point size';
  const meta = serialized.meta;
  if (meta && Object.keys(meta).some(key => !['object', 'lineage', 'state'].includes(key))) return 'unsupported Line metadata';
  if (meta?.object && Object.keys(meta.object).some(key => key !== 'key')) return 'unsupported Line object metadata';
  if (meta?.lineage && Object.keys(meta.lineage).some(key => key !== 'key')) return 'unsupported Line lineage metadata';
  if (meta?.state && Object.keys(meta.state).some(key => !['sceneState', 'scopes'].includes(key))) return 'unsupported Line state metadata';
  if (meta?.state?.sceneState && Object.keys(meta.state.sceneState).some(key => !['detail', 'axis'].includes(key))) return 'unsupported Line scene metadata';
  const axis = meta?.state?.sceneState?.axis as Record<string, unknown> | undefined;
  if (axis && Object.keys(axis).some(key => !['flip', 'order', 'duration', 'stagger'].includes(key))) return 'unsupported Line axis state';
  if (axis?.flip !== undefined && typeof axis.flip !== 'boolean') return 'invalid Line axis flip';
  if (axis?.order !== undefined && (!Array.isArray(axis.order) || axis.order.length !== 2 || new Set(axis.order).size !== 2 || axis.order.some(value => value !== 'x' && value !== 'y'))) return 'invalid Line axis order';
  if (axis?.duration !== undefined && (typeof axis.duration !== 'number' || !Number.isFinite(axis.duration) || axis.duration < 0)) return 'invalid Line axis duration';
  if (axis?.stagger !== undefined) return 'Line axis stagger requires the native route';
  const detail = meta?.state?.sceneState?.detail as Record<string, unknown> | undefined;
  if (detail && Object.keys(detail).some(key => !['mode', 'seriesField', 'op'].includes(key))) return 'runtime Line zipper stages are not authored operations';
  if (detail && !['series', 'single'].includes(String(detail.mode))) return 'unsupported Line detail mode';
  const series = lineSeriesKey(lineState(serialized, serialized.encoding));
  if (detail?.mode === 'series' && (!series || typeof detail.seriesField !== 'string')) return 'Line breakdown requires a series field';
  if (!ordinary && !detail && serialized.encoding?.color?.field) return 'implicit color-derived Line series requires the native route';
  const expectedKey = series ? [x, series] : x;
  if (!ordinary && meta?.object?.key !== undefined && !deepEqual(meta.object.key, expectedKey)) return 'custom Line mark key requires the native route';
  const raw = serialized.data;
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { values?: unknown[] }).values) ? (raw as { values: unknown[] }).values : null;
  if (!rows || !rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) return 'Line planning requires resolved inline records';
  const transforms = serialized.transform ?? [];
  const aggregates = transforms.filter(item => 'aggregate' in item);
  if (aggregates.length && yType !== 'quantitative') return 'Line summary requires a quantitative y measure';
  if (aggregates.length > 1) return 'Line planning supports only one aggregate';
  if (aggregates.length && !('aggregate' in transforms[transforms.length - 1]!)) return 'Line rollup aggregate must be last in the pipeline';
  if (transforms.some(item => Object.keys(item).length !== 1 || !['filter', 'sort', 'timeUnit', 'aggregate'].some(key => key in item))) return 'unsupported Line transform';
  if (Boolean(aggregates.length) !== (detail?.mode === 'single')) return 'Line single detail and rollup aggregate must agree';
  if (aggregates.length) {
    const agg = (aggregates[0] as { aggregate: AggregateTransform }).aggregate;
    const field = agg.fields?.[0];
    if (!deepEqual(agg.groupby, [x]) || agg.fields?.length !== 1 || !field || !reducers.has(field.op ?? '') || !field.as || field.as === x || field.as !== y || !field.field || detail?.op !== field.op) return 'Line rollup requires one supported measure grouped by x with a truthful output alias';
  }
  let transformed: Record<string, unknown>[];
  try {
    // Check references at their actual pipeline position before transformations run.
    let fields = new Set(rows.flatMap(row => Object.keys(row as Record<string, unknown>)));
    for (const transform of transforms) {
      if ('filter' in transform && !fields.has(normalizeFilter(transform.filter).field)) return 'Line filter references an unavailable field';
      if ('sort' in transform) {
        const sort = transform.sort as { field?: string; fields?: Array<string | {field: string}> };
        const names = [...(sort.field ? [sort.field] : []), ...(sort.fields ?? []).map(item => typeof item === 'string' ? item : item.field)];
        if (names.some(name => !fields.has(name))) return 'Line sort references an unavailable field';
      }
      if ('timeUnit' in transform) {
        const timeUnit = transform.timeUnit as {field: string; as?: string; unit: string};
        if (!fields.has(timeUnit.field)) return 'Line timeUnit references an unavailable field';
        fields.add(timeUnit.as ?? `${timeUnit.field}_${timeUnit.unit}`);
      }
      if ('aggregate' in transform) {
        const agg = transform.aggregate as AggregateTransform;
        if ((agg.groupby ?? []).some(name => !fields.has(name)) || (agg.fields ?? []).some(field => field.op !== 'count' && !fields.has(field.field ?? ''))) return 'Line rollup references an unavailable field';
        fields = new Set([...(agg.groupby ?? []), ...(agg.fields ?? []).map(field => field.as!)]);
      }
    }
    if (series && !fields.has(series)) return 'Line series references an unavailable output field';
    for (const raw of Object.values(serialized.encoding ?? {})) for (const channel of Array.isArray(raw) ? raw : [raw]) {
      if (channel?.field && !fields.has(channel.field)) return `Line encoding references unavailable field "${channel.field}"`;
    }
    for (const scope of Object.values(specScopes(serialized))) {
      if (!scope) continue;
      const filters = scope.filters ?? (scope.filter ? [scope.filter] : scope.field ? [{ field: scope.field, equal: scope.equal }] : []);
      if (filters.some((filter: unknown) => !fields.has(normalizeFilter(filter).field))) return 'Line attention references an unavailable output field';
    }
    transformed = applyTransforms(rows as Record<string, unknown>[], transforms);
  } catch (error) { return error instanceof Error ? error.message : 'invalid Line pipeline'; }
  if (yType === undefined && resolveSpecDataTypes(serialized, transformed).encoding?.y?.type !== 'quantitative') return 'Line raw y values must infer a quantitative measure';
  const keys = new Set<string>();
  for (const row of transformed) {
    if (row[x] == null || row[y] == null || (series && row[series] == null) || !Number.isFinite(Number(row[y]))) return 'Line observations require finite measures and defined x values';
    const key = JSON.stringify([row[x], series ? row[series] : null]);
    if (keys.has(key)) return 'Line observations require one x per series';
    keys.add(key);
  }
  return null;
}
