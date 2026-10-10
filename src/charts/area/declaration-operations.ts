import { createDeclarationOperationCodec, createStandardDeclarationOperationCodec, deepEqual, validateCanonicalAttentionScopes, validateCanonicalEncoding, validateExplicitSourceDatumIdentity } from '../../grammar/declaration-operations.js';
import { validateCanonicalPositionDomains } from '../../grammar/declaration-domains.js';
import { serializeViewSpec, specScopes } from '../../spec-meta.js';
import { applyTransforms } from '../../data/transforms.js';
import { normalizeFilter } from '../../data/filter.js';
import { isD3AreaCurveName } from '../curve.js';
import { validateTransforms } from '../../data/validate.js';
import { areaState } from './state.js';
import { areaGrainError } from './grain.js';
import type { DeclarationCodecResult, DeclarationOperationCodec, AggregateTransform, ViewSpec } from '../../types/index.js';
import type { AreaViewState } from './authoring.js';

const ROOT = '__visdeltaAreaTopology';
const LAYOUT = '__visdeltaAreaLayout';
const reducers = new Set(['sum', 'count', 'mean', 'min', 'max', 'median']);
type Topology = { detail: Record<string, unknown> | null; aggregate: AggregateTransform | null };
const fail = <T>(reason: string): DeclarationCodecResult<T> => ({ status: 'unsupported', reason });

/** A breakdown/rollup is one declaration; its derived y binding and identity travel together. */
export function createAreaDeclarationOperationCodec(): DeclarationOperationCodec<AreaViewState> {
  const ordinaryValidator = createStandardDeclarationOperationCodec<AreaViewState>({
    mark: 'area', requiredChannels: ['x', 'y'], allowedChannels: ['x', 'y', 'color', 'tooltip', 'key'],
    allowedRoots: ['mark', 'data', 'encoding', 'transform', 'meta', 'key', 'datumKey', 'margin', 'curve', 'connect', 'baseline'],
    validate: value => validateArea(value, true) ?? undefined
  });
  const ordinary = createDeclarationOperationCodec<AreaViewState>({
    allowedRoots: ['mark', 'data', 'encoding', 'transform', 'meta', 'key', 'datumKey', 'margin', 'curve', 'connect', 'baseline'],
    atomicPaths: [['margin']], normalize: value => { prune(value); return value; },
    validate: value => { const result = ordinaryValidator.validate(value); return result.status === 'unsupported' ? result.reason : undefined; }
  });
  const shadowCodec = createDeclarationOperationCodec<ViewSpec>({
    allowedRoots: ['mark', 'data', 'encoding', 'transform', 'meta', 'key', 'datumKey', 'margin', 'curve', 'connect', 'baseline', ROOT, LAYOUT],
    atomicPaths: [['margin'], [ROOT], [LAYOUT], ['meta', 'state', 'sceneState', 'axis']],
    derivedPaths: [['meta', 'object']],
    normalize: value => { prune(value); return value; }
  });
  const codec: DeclarationOperationCodec<AreaViewState> = {
    supportsTransition(from, to) {
      if (isOrdinary(from) !== isOrdinary(to)) return 'Area explicit detail transitions use the native topology route';
      if (Boolean(topology(from).aggregate) !== Boolean(topology(to).aggregate)) return 'Area raw and summary declarations use the native topology route';
    },
    normalize(spec) {
      if (isOrdinary(spec)) return ordinary.normalize(spec);
      const reason = validateArea(spec);
      return reason ? fail(reason) : { status: 'ok', value: normalizeArea(spec) };
    },
    validate(spec) { if (isOrdinary(spec)) return ordinary.validate(spec); const reason = validateArea(spec); return reason ? fail(reason) : { status: 'ok', value: undefined }; },
    decompose(spec) {
      if (isOrdinary(spec)) return ordinary.decompose(spec);
      const reason = validateArea(spec);
      return reason ? fail(reason) : shadowCodec.decompose(toShadow(normalizeArea(spec)));
    },
    evaluate(template, operations) {
      if (isOrdinary(template)) return ordinary.evaluate(template, operations);
      const result = shadowCodec.evaluate(toShadow(normalizeArea(template)), operations);
      if (result.status !== 'ok') return result;
      const candidate = fromShadow(result.value);
      const reason = validateArea(candidate);
      if (reason) return fail(reason);
      const normalized = normalizeArea(candidate);
      const roundTrip = shadowCodec.decompose(toShadow(normalized));
      if (roundTrip.status !== 'ok' || !deepEqual(roundTrip.value, operations)) return fail('Area topology operations do not round-trip');
      return { status: 'ok', value: normalized };
    }
  };
  return codec;
}

function isOrdinary(spec: AreaViewState): boolean {
  return !(spec.transform ?? []).some(item => 'aggregate' in item) && !serializeViewSpec(spec).meta?.state?.sceneState;
}
function topology(spec: AreaViewState): Topology {
  const serialized = serializeViewSpec(spec);
  const detail = serialized.meta?.state?.sceneState?.detail as Record<string, unknown> | undefined;
  const aggregate = (serialized.transform ?? []).find(item => 'aggregate' in item) as { aggregate: AggregateTransform } | undefined;
  const topologyDetail = detail ? { ...detail } : null;
  if (topologyDetail) { delete topologyDetail.layout; delete topologyDetail.offset; delete topologyDetail.order; }
  return { detail: topologyDetail, aggregate: aggregate?.aggregate ?? null };
}
function toShadow(spec: AreaViewState): ViewSpec {
  const value = serializeViewSpec(spec) as ViewSpec & Record<string, unknown>;
  value[ROOT] = topology(spec);
  const state = areaState(spec, spec.encoding);
  if (state.mode === 'stacked' && state.layout === 'stream') value[LAYOUT] = { layout: 'stream', offset: state.stackOffset, order: state.stackOrder };
  value.transform = (value.transform ?? []).filter(item => !('aggregate' in item));
  const measure = topology(spec).aggregate?.fields?.[0];
  if (measure && value.encoding?.y) value.encoding.y = { ...value.encoding.y, field: '__visdeltaAreaSummaryMeasure' };
  if (value.meta?.state?.sceneState) delete value.meta.state.sceneState.detail;
  if (value.meta) delete value.meta.object;
  // Empty metadata is removed consistently by normalizeArea, not retained as an operation.
  prune(value);
  return value;
}
function fromShadow(shadow: ViewSpec): AreaViewState {
  const value = serializeViewSpec(shadow) as ViewSpec & Record<string, unknown>;
  const slot = value[ROOT] as Topology | undefined;
  delete value[ROOT];
  const layout = value[LAYOUT] as Record<string, unknown> | undefined;
  delete value[LAYOUT];
  if (layout && slot?.detail?.mode !== 'stacked') return value as AreaViewState;
  if (!slot) return value as AreaViewState;
  if (slot.aggregate) {
    const measure = slot.aggregate.fields?.[0];
    if (value.encoding?.y?.field !== '__visdeltaAreaSummaryMeasure') return value as AreaViewState;
    value.encoding = { ...value.encoding, y: { ...value.encoding?.y, field: measure?.as } };
    value.transform = [...(value.transform ?? []), { aggregate: slot.aggregate }];
  }
  if (slot.detail) {
    value.meta = { ...value.meta, state: { ...value.meta?.state, sceneState: { ...value.meta?.state?.sceneState, detail: { ...slot.detail, ...(slot.detail.mode === 'stacked' ? layout ?? { layout: 'stacked' } : {}) } } } };
  }
  return normalizeArea(value as AreaViewState);
}
function normalizeArea(spec: AreaViewState): AreaViewState {
  const value = serializeViewSpec(spec) as AreaViewState;
  const detail = value.meta?.state?.sceneState?.detail as Record<string, unknown> | undefined;
  if (detail?.mode === 'single') { delete detail.seriesField; delete detail.layout; delete detail.offset; delete detail.order; }
  if (detail?.mode === 'stacked' && detail.layout === 'stream') { detail.offset ??= 'wiggle'; detail.order ??= 'insideOut'; }
  if (detail?.mode === 'stacked' && detail.layout !== 'stream') { detail.layout = 'stacked'; delete detail.offset; delete detail.order; }
  const x = value.encoding?.x?.field;
  const series = areaState(value, value.encoding).seriesField;
  if (x) value.meta = { ...value.meta, object: { ...value.meta?.object, key: series ? [x, series] : x } };
  prune(value);
  return value;
}
function prune(value: ViewSpec) {
  // Renderer defaults have the same effective state as an omitted declaration.
  if (value.connect === 'adjacent') delete value.connect;
  if (value.baseline === 0) delete value.baseline;
  if (value.curve === 'curveLinear') delete value.curve;
  if (value.meta?.state?.scopes && !Object.keys(value.meta.state.scopes).length) delete value.meta.state.scopes;
  if (value.transform?.length === 0) delete value.transform;
  const scene = value.meta?.state?.sceneState;
  if (scene && !Object.keys(scene).length) delete value.meta!.state!.sceneState;
  if (value.meta?.state && !Object.keys(value.meta.state).length) delete value.meta.state;
  if (value.meta?.object && !Object.keys(value.meta.object).length) delete value.meta.object;
  if (value.meta && !Object.keys(value.meta).length) delete value.meta;
}

function validateArea(spec: AreaViewState, ordinary = false): string | null {
  if (spec.mark !== 'area') return 'declaration is not an Area';
  const serialized = serializeViewSpec(spec);
  const encodingError = validateCanonicalEncoding(serialized, ['x', 'y', 'color', 'tooltip', 'key']);
  if (encodingError) return encodingError;
  const x = serialized.encoding?.x?.field;
  const y = serialized.encoding?.y?.field;
  if (!x || !y) return 'Area requires complete x and y bindings';
  if (serialized.encoding?.y?.type !== undefined && serialized.encoding.y.type !== 'quantitative') return 'Area requires a quantitative y measure';
  const domains = validateCanonicalPositionDomains(serialized);
  if (domains) return domains;
  const identity = validateExplicitSourceDatumIdentity(serialized);
  if (identity) return identity;
  const attention = validateCanonicalAttentionScopes(serialized);
  if (attention) return attention;
  if (spec.curve !== undefined && !isD3AreaCurveName(spec.curve)) return 'unsupported Area curve';
  if (spec.connect !== undefined && spec.connect !== 'adjacent' && spec.connect !== 'across') return 'unsupported Area connection';
  if (spec.baseline !== undefined && !Number.isFinite(spec.baseline)) return 'invalid Area baseline';
  const meta = serialized.meta;
  if (meta && Object.keys(meta).some(key => !['object', 'lineage', 'state'].includes(key))) return 'unsupported Area metadata';
  if (meta?.object && Object.keys(meta.object).some(key => key !== 'key')) return 'unsupported Area object metadata';
  if (meta?.lineage && Object.keys(meta.lineage).some(key => key !== 'key')) return 'unsupported Area lineage metadata';
  if (meta?.state && Object.keys(meta.state).some(key => !['sceneState', 'scopes'].includes(key))) return 'unsupported Area state metadata';
  if (meta?.state?.sceneState && Object.keys(meta.state.sceneState).some(key => !['detail', 'axis'].includes(key))) return 'unsupported Area scene metadata';
  const axis = meta?.state?.sceneState?.axis as Record<string, unknown> | undefined;
  if (axis && Object.keys(axis).some(key => !['flip', 'order', 'duration', 'stagger'].includes(key))) return 'unsupported Area axis state';
  if (axis?.flip !== undefined && typeof axis.flip !== 'boolean') return 'invalid Area axis flip';
  if (axis?.order !== undefined && (!Array.isArray(axis.order) || axis.order.length !== 2 || new Set(axis.order).size !== 2 || axis.order.some(value => value !== 'x' && value !== 'y'))) return 'invalid Area axis order';
  if (axis?.duration !== undefined && (typeof axis.duration !== 'number' || !Number.isFinite(axis.duration) || axis.duration < 0)) return 'invalid Area axis duration';
  if (axis?.stagger !== undefined) return 'Area axis stagger requires the native route';
  const detail = meta?.state?.sceneState?.detail as Record<string, unknown> | undefined;
  if (detail && Object.keys(detail).some(key => !['mode', 'seriesField', 'op', 'layout', 'offset', 'order'].includes(key))) return 'runtime Area stages are not authored operations';
  if (detail && !['stacked', 'single'].includes(String(detail.mode))) return 'unsupported Area detail mode';
  if (detail?.mode === 'stacked') {
    if (detail.layout !== undefined && !['stacked', 'stream'].includes(String(detail.layout))) return 'unsupported Area layout';
    if (detail.layout === 'stream') {
      if (!['none', 'expand', 'diverging', 'silhouette', 'wiggle'].includes(String(detail.offset ?? 'wiggle'))) return 'unsupported Area stream offset';
      if (!['none', 'reverse', 'appearance', 'ascending', 'descending', 'insideOut'].includes(String(detail.order ?? 'insideOut'))) return 'unsupported Area stream order';
    } else if (detail.offset !== undefined || detail.order !== undefined) return 'Area stream options require stream layout';
  }
  const series = areaState(serialized, serialized.encoding).seriesField;
  if (detail?.mode === 'stacked' && (!series || typeof detail.seriesField !== 'string')) return 'Area breakdown requires a series field';
  if (!ordinary && !detail && serialized.encoding?.color?.field) return 'implicit color-derived Area series requires the native route';
  const expectedKey = series ? [x, series] : x;
  if (!ordinary && meta?.object?.key !== undefined && !deepEqual(meta.object.key, expectedKey)) return 'custom Area mark key requires the native route';
  const raw = serialized.data;
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { values?: unknown[] }).values) ? (raw as { values: unknown[] }).values : null;
  if (!rows || !rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) return 'Area planning requires resolved inline data records';
  const transforms = serialized.transform ?? [];
  try { validateTransforms(transforms); } catch (error) { return error instanceof Error ? error.message : 'invalid Area transforms'; }
  const aggregates = transforms.filter(item => 'aggregate' in item);
  if (aggregates.length > 1) return 'Area planning supports only one aggregate';
  if (aggregates.length && !('aggregate' in transforms[transforms.length - 1]!)) return 'Area rollup aggregate must be last in the pipeline';
  if (transforms.some(item => Object.keys(item).length !== 1 || !['filter', 'sort', 'timeUnit', 'aggregate'].some(key => key in item))) return 'unsupported Area transform';
  if (Boolean(aggregates.length) !== (detail?.mode === 'single')) return 'Area single detail and rollup aggregate must agree';
  if (aggregates.length) {
    if (serialized.encoding?.y?.type !== 'quantitative') return 'Area summary requires a quantitative y measure';
    const agg = (aggregates[0] as { aggregate: AggregateTransform }).aggregate;
    const field = agg.fields?.[0];
    if (!deepEqual(agg.groupby, [x]) || agg.fields?.length !== 1 || !field || !reducers.has(field.op ?? '') || !field.as || field.as === x || field.as !== y || !field.field || detail?.op !== field.op) return 'Area rollup requires one supported measure grouped by x with a truthful output alias';
  }
  let transformed: Record<string, unknown>[];
  try {
    // Check references at their actual pipeline position before transformations run.
    let fields = new Set(rows.flatMap(row => Object.keys(row as Record<string, unknown>)));
    for (const transform of transforms) {
      if ('filter' in transform && !fields.has(normalizeFilter(transform.filter).field)) return 'Area filter references an unavailable field';
      if ('sort' in transform) {
        const sort = transform.sort as { field?: string; fields?: Array<string | {field: string}> };
        const names = [...(sort.field ? [sort.field] : []), ...(sort.fields ?? []).map(item => typeof item === 'string' ? item : item.field)];
        if (names.some(name => !fields.has(name))) return 'Area sort references an unavailable field';
      }
      if ('timeUnit' in transform) {
        const timeUnit = transform.timeUnit as {field: string; as?: string; unit: string};
        if (!fields.has(timeUnit.field)) return 'Area timeUnit references an unavailable field';
        fields.add(timeUnit.as ?? `${timeUnit.field}_${timeUnit.unit}`);
      }
      if ('aggregate' in transform) {
        const agg = transform.aggregate as AggregateTransform;
        if ((agg.groupby ?? []).some(name => !fields.has(name)) || (agg.fields ?? []).some(field => field.op !== 'count' && !fields.has(field.field ?? ''))) return 'Area rollup references an unavailable field';
        fields = new Set([...(agg.groupby ?? []), ...(agg.fields ?? []).map(field => field.as!)]);
      }
    }
    if (series && !fields.has(series)) return 'Area series references an unavailable output field';
    for (const raw of Object.values(serialized.encoding ?? {})) for (const channel of Array.isArray(raw) ? raw : [raw]) {
      if (channel?.field && !fields.has(channel.field)) return `Area encoding references unavailable field "${channel.field}"`;
    }
    for (const scope of Object.values(specScopes(serialized))) {
      if (!scope) continue;
      const filters = scope.filters ?? (scope.filter ? [scope.filter] : scope.field ? [{ field: scope.field, equal: scope.equal }] : []);
      if (filters.some((filter: unknown) => !fields.has(normalizeFilter(filter).field))) return 'Area attention references an unavailable output field';
    }
    transformed = applyTransforms(rows as Record<string, unknown>[], transforms);
  } catch (error) { return error instanceof Error ? error.message : 'invalid Area pipeline'; }
  const singleGrainError = areaGrainError(serialized, transformed);
  if (singleGrainError) return singleGrainError;
  const keys = new Set<string>();
  for (const row of transformed) {
    if (row[x] == null || !Number.isFinite(Number(row[y]))) return 'Area observations require finite measures and defined x values';
    if (series && row[series] == null) return 'Area stacked observations require a defined series value';
    const key = JSON.stringify([String(row[x]), series ? String(row[series]) : null]);
    if (keys.has(key)) return 'Area observations require one x per series';
    keys.add(key);
  }
  return null;
}
