import { createDeclarationOperationCodec, validateCanonicalAttentionScopes, validateCanonicalDataFields, validateCanonicalEncoding, validateCanonicalTransformPipeline, validateExplicitSourceDatumIdentity, deepEqual } from '../../grammar/declaration-operations.js';
import { validateTransforms } from '../../data/validate.js';
import { normalizeFilter } from '../../data/filter.js';
import { serializeViewSpec, semanticToMeta, specScopes } from '../../spec-meta.js';
import { validateCanonicalPositionDomains } from '../../grammar/declaration-domains.js';
import { barState } from './state.js';
import { semanticBarState } from './semantic.js';
import { withObject } from '../compiler-utils.js';
import { resolveSpecDataTypes } from '../../data/types.js';
import { semanticKeyFromEncoding } from './compile.js';
import type { AggregateTransform, CanonicalDeclarationOperation, DeclarationCodecResult, DeclarationOperationCodec, SemanticKey, TransformSpec, ViewSpec } from '../../types/index.js';
import type { BarSpec } from './chart.js';

const ANCHOR = { __visdeltaBarGrainAnchor: true };
const GRAIN_ROOT = '__visdeltaBarGrain';
const GRAIN_PATH = [GRAIN_ROOT];
const AGG_OPS = new Set(['count', 'sum', 'mean', 'min', 'max', 'median']);
type Grain = { grouping: GroupingSlot; measure: MeasureSlot; layout?: LayoutSlot };
type GroupingSlot = { groupby: string[]; category: string; categoryAxis: 'x' | 'y'; detail: Record<string, unknown> | null; markKey: string[] };
type GroupingSemantics = Omit<GroupingSlot, 'categoryAxis'>;
type MeasureSlot = { op: string; field?: string; as: string };
type LayoutSlot = { channel: 'xOffset' | 'yOffset'; options: Record<string, unknown> };

/** Bar's aggregate is represented to Core as an opaque sequence anchor. */
export function createBarGrainDeclarationOperationCodec(): DeclarationOperationCodec<BarSpec> {
  const ordinary = createDeclarationOperationCodec<BarSpec>({
    allowedRoots: [
      'mark', 'data', 'encoding', 'transform', 'key', 'datumKey', 'semanticKey', 'transition',
      'axis', 'detail', 'selection', 'scopes', 'unit', 'connector', 'meta', 'margin', 'height', 'width'
    ],
    atomicPaths: [['margin'], ['meta', 'state', 'sceneState', 'detail'], ['meta', 'state', 'sceneState', 'axis']],
    derivedPaths: [['meta', 'object', 'semantic']],
    normalize: normalizeOrdinaryBar,
    validate: validateOrdinaryBar
  });
  const generic = createDeclarationOperationCodec<ViewSpec>({
    allowedRoots: [
      'mark', 'data', 'encoding', 'transform', 'key', 'datumKey', 'semanticKey', 'transition',
      'axis', 'detail', 'selection', 'scopes', 'unit', 'connector', 'meta', 'margin', 'height', 'width', GRAIN_ROOT
    ],
    atomicPaths: [['margin'], ['meta', 'state', 'sceneState', 'detail'], ['meta', 'state', 'sceneState', 'axis'], [...GRAIN_PATH, 'grouping'], [...GRAIN_PATH, 'measure'], [...GRAIN_PATH, 'layout']],
    derivedPaths: [['meta', 'object', 'semantic']]
  });
  return {
    supportsTransition(from, to) {
      if (hasAggregate(from) !== hasAggregate(to)) return 'Bar Grain planning requires aggregate transforms at both endpoints';
      if (!hasAggregate(from)) return;
      if (semanticBarState(from).orientation !== semanticBarState(to).orientation) {
        return 'Bar Grain planning does not combine reorientation with grouping or measure changes';
      }
    },
    normalize(spec) {
      if (!hasAggregate(spec)) return ordinary.normalize(spec);
      const reason = validateGrainBar(spec);
      return reason ? unsupported(reason) : { status: 'ok', value: normalizeBar(spec) };
    },
    validate(spec) {
      if (!hasAggregate(spec)) return ordinary.validate(spec);
      const reason = validateGrainBar(spec);
      return reason ? { status: 'unsupported', reason } : { status: 'ok', value: undefined };
    },
    validateStep(from, to, endpoints) {
      const accepted: DeclarationCodecResult<void> = { status: 'ok', value: undefined };
      if (deepEqual(specScopes(endpoints.from).focus, specScopes(endpoints.to).focus)
        || deepEqual(specScopes(from).focus, specScopes(to).focus)) return accepted;
      const source = groupingFrom(endpoints.from);
      const target = groupingFrom(endpoints.to);
      if (!source || !target || source.category !== target.category) return accepted;
      const strictSubset = (a: GroupingSemantics, b: GroupingSemantics) =>
        a.groupby.length < b.groupby.length && a.groupby.every(field => b.groupby.includes(field));
      const coarse = strictSubset(source, target) ? source : strictSubset(target, source) ? target : null;
      if (!coarse) return accepted;
      return deepEqual(groupingFrom(from), coarse) && deepEqual(groupingFrom(to), coarse)
        ? accepted
        : unsupported('Bar focus changes across a refinement must occur at the coarse endpoint grouping');
    },
    decompose(spec) {
      if (!hasAggregate(spec)) return ordinary.decompose(spec);
      const shadow = toShadow(spec);
      return shadow.status === 'ok' ? generic.decompose(shadow.value) : shadow;
    },
    evaluate(template, operations) {
      if (!hasAggregate(template)) return ordinary.evaluate(template, operations);
      const shadow = toShadow(template);
      if (shadow.status !== 'ok') return shadow;
      const evaluated = generic.evaluate(shadow.value, operations);
      if (evaluated.status !== 'ok') return evaluated;
      const actual = fromShadow(evaluated.value);
      if (actual.status !== 'ok') return actual;
      const normalized = normalizeBar(actual.value);
      const reason = validateGrainBar(normalized);
      if (reason) return { status: 'unsupported', reason };
      const roundTrip = toShadow(normalized);
      if (roundTrip.status !== 'ok') return roundTrip;
      const decomposed = generic.decompose(roundTrip.value);
      if (decomposed.status !== 'ok' || !sameOperations(decomposed.value, operations)) {
        return { status: 'unsupported', reason: 'Bar grain evaluation does not round-trip to the same operations' };
      }
      return { status: 'ok', value: normalized };
    }
  };
}

function groupingFrom(spec: BarSpec): GroupingSemantics | null {
  const aggregates = (spec.transform ?? []).filter(item => 'aggregate' in item);
  if (aggregates.length !== 1) return null;
  const grain = grainFrom(spec, (aggregates[0] as { aggregate: AggregateTransform }).aggregate);
  if (grain.status !== 'ok') return null;
  const { groupby, category, detail, markKey } = grain.value.grouping;
  return { groupby, category, detail, markKey };
}

function toShadow(spec: BarSpec): DeclarationCodecResult<ViewSpec> {
  const serialized = serializeViewSpec(spec) as ViewSpec & Record<string, unknown>;
  const transforms = serialized.transform ?? [];
  const indices = transforms.flatMap((item, index) => ('aggregate' in item ? [index] : []));
  if (indices.length !== 1) return unsupported('Bar Grain plans require exactly one aggregate transform');
  const index = indices[0]!;
  const agg = (transforms[index] as { aggregate: AggregateTransform }).aggregate;
  const grain = grainFrom(spec, agg);
  if (grain.status !== 'ok') return grain;
  serialized.transform = transforms.map((item, at) => at === index ? { ...ANCHOR } : item);
  const encoding = { ...(serialized.encoding ?? {}) } as Record<string, unknown>;
  for (const channel of ['x', 'y']) {
    const declaration = encoding[channel];
    if (declaration && !Array.isArray(declaration) && typeof declaration === 'object') {
      const attributes = { ...(declaration as Record<string, unknown>) };
      delete attributes.field;
      if (Object.keys(attributes).length) encoding[channel] = attributes;
      else delete encoding[channel];
    }
  }
  for (const channel of ['detail', 'xOffset', 'yOffset']) delete encoding[channel];
  serialized.encoding = encoding as ViewSpec['encoding'];
  if (serialized.meta?.object) delete serialized.meta.object;
  if (serialized.meta && Object.keys(serialized.meta).length === 0) delete serialized.meta;
  serialized[GRAIN_ROOT] = grain.value;
  return { status: 'ok', value: serialized };
}

function fromShadow(shadow: ViewSpec): DeclarationCodecResult<BarSpec> {
  const value = { ...serializeViewSpec(shadow) } as ViewSpec & Record<string, unknown>;
  const grain = value[GRAIN_ROOT] as Grain | undefined;
  if (!grain?.grouping || !grain.measure || !Array.isArray(value.transform)) return unsupported('Bar Grain operation state is incomplete');
  const indices = value.transform.flatMap((item, index) => isAnchor(item) ? [index] : []);
  if (indices.length !== 1) return unsupported('Bar transform pipeline lost its fixed aggregate position');
  const aggregate: AggregateTransform = {
    groupby: [...grain.grouping.groupby],
    fields: [{ op: grain.measure.op, ...(grain.measure.field ? { field: grain.measure.field } : {}), as: grain.measure.as }]
  };
  value.transform = value.transform.map((item, at) => at === indices[0] ? { aggregate } : item);
  delete value[GRAIN_ROOT];
  const encoding = { ...(value.encoding ?? {}) } as Record<string, unknown>;
  const categoryAxis = grain.grouping.categoryAxis;
  const measureAxis = categoryAxis === 'x' ? 'y' : 'x';
  encoding[categoryAxis] = { ...(encoding[categoryAxis] as object ?? {}), field: grain.grouping.category };
  encoding[measureAxis] = { ...(encoding[measureAxis] as object ?? {}), field: grain.measure.as };
  if (grain.grouping.detail) encoding.detail = grain.grouping.detail;
  else delete encoding.detail;
  delete encoding.xOffset;
  delete encoding.yOffset;
  if (grain.layout) {
    const detailField = (grain.grouping.detail as { field?: string } | null)?.field;
    if (!detailField) return unsupported('grouped Bar layout requires a detail field');
    encoding[grain.layout.channel] = { ...grain.layout.options, field: detailField };
  }
  value.encoding = encoding as ViewSpec['encoding'];
  const meta = { ...(value.meta ?? {}) };
  const object = { ...(meta.object ?? {}) };
  object.key = grain.grouping.markKey.length === 1 ? grain.grouping.markKey[0] : [...grain.grouping.markKey];
  delete object.semantic;
  meta.object = object;
  value.meta = meta;
  return { status: 'ok', value: normalizeBar(value as BarSpec) };
}

function grainFrom(spec: BarSpec, aggregate: AggregateTransform): DeclarationCodecResult<Grain> {
  const state = barState(spec);
  const encoded = serializeViewSpec(spec);
  const fields = aggregate.fields ?? [];
  const groupby = aggregate.groupby ?? [];
  if (fields.length !== 1 || groupby.length === 0 || new Set(groupby).size !== groupby.length || !groupby.every(field => typeof field === 'string' && field)) {
    return unsupported('Bar Grain supports one aggregate measure and a complete unique groupby');
  }
  const measure = fields[0]!;
  if (!measure.op || !AGG_OPS.has(measure.op) || !measure.as || (measure.op !== 'count' && !measure.field)) {
    return unsupported('Bar Grain aggregate measure must have a supported op, input field, and output alias');
  }
  const category = state?.categoryField;
  if (!category || !groupby.includes(category)) return unsupported('Bar Grain groupby must include the category channel field');
  if (groupby.includes(measure.as)) return unsupported('Bar aggregate output alias must not overwrite a groupby field');
  const detailRaw = encoded.encoding?.detail;
  const detail = detailRaw && !Array.isArray(detailRaw) ? detailRaw as Record<string, unknown> : null;
  const detailField = typeof detail?.field === 'string' ? detail.field : null;
  if (detailRaw && (!detailField || !groupby.includes(detailField) || detailField === category)) {
    return unsupported('Bar Grain detail must name one non-category field in the aggregate groupby');
  }
  if (groupby.length > (detailField ? 2 : 1)) return unsupported('Bar Grain currently supports category totals and one detail field');
  const expectedKey = [...(detailField ? [category, detailField] : groupby)].sort((a, b) => a.localeCompare(b));
  const rawKey = encoded.meta?.object?.key;
  const actualKey = Array.isArray(rawKey) ? rawKey : rawKey == null ? [] : [rawKey];
  if (!deepEqual(actualKey.slice().sort(), expectedKey)) return unsupported('explicit Bar mark key does not match the complete Grain identity');
  if (!state?.measureField || state.measureField !== measure.as) return unsupported('Bar measure channel must bind to the aggregate output alias');
  const layout = semanticBarState(spec).layout;
  if (!detailField && layout !== 'simple') return unsupported('grouped or stacked Bar layout requires a detail field');
  const xOffset = encoded.encoding?.xOffset;
  const yOffset = encoded.encoding?.yOffset;
  if (layout === 'grouped') {
    const offset = xOffset ?? yOffset;
    const expectedOffset = state?.categoryField === (encoded.encoding?.y as { field?: string } | undefined)?.field ? yOffset : xOffset;
    if (!offset || Array.isArray(offset) || (offset as { field?: string }).field !== detailField || Boolean(xOffset) === Boolean(yOffset) || offset !== expectedOffset) {
      return unsupported('grouped Bar layout requires one offset binding to its detail field');
    }
  } else if (xOffset || yOffset) return unsupported('Bar offsets require grouped layout');
  return { status: 'ok', value: {
    grouping: { groupby: [...groupby], category, categoryAxis: (encoded.encoding?.x?.field === category ? 'x' : 'y'), detail: detail ? { ...detail } : null, markKey: expectedKey },
    measure: { op: measure.op, ...(measure.field ? { field: measure.field } : {}), as: measure.as },
    ...(layout === 'grouped' ? { layout: groupedLayoutSlot(xOffset, yOffset) } : {})
  } };
}

function groupedLayoutSlot(xOffset: unknown, yOffset: unknown): LayoutSlot {
  const channel = xOffset ? 'xOffset' : 'yOffset';
  const raw = (xOffset ?? yOffset) as Record<string, unknown>;
  const options = { ...raw };
  delete options.field;
  return { channel, options };
}

function validateGrainBar(spec: BarSpec): string | null {
  if (spec.mark !== 'bar') return 'declaration is not a Bar';
  const transforms = spec.transform ?? [];
  try { validateTransforms(transforms); } catch (error) { return error instanceof Error ? error.message : 'invalid Bar transform pipeline'; }
  const aggregateIndices = transforms.flatMap((item, index) => ('aggregate' in item ? [index] : []));
  if (aggregateIndices.length !== 1) return 'Bar Grain plans require exactly one aggregate transform';
  const aggregateIndex = aggregateIndices[0]!;
  if (transforms.some((item, index) => index !== aggregateIndex && !(Object.keys(item).length === 1 && ['filter', 'sort', 'timeUnit'].some(key => key in item)))) {
    return 'Bar Grain pipeline contains an unsupported transform';
  }
  const aggregate = (transforms[aggregateIndex] as { aggregate: AggregateTransform }).aggregate;
  const grain = grainFrom(spec, aggregate);
  if (grain.status !== 'ok') return grain.reason;
  const encodingError = validateCanonicalEncoding(spec, ['x', 'y', 'color', 'detail', 'tooltip', 'key', 'xOffset', 'yOffset']);
  if (encodingError) return encodingError;
  const domainError = validateCanonicalPositionDomains(spec);
  if (domainError) return domainError;
  const datumIdentityError = validateExplicitSourceDatumIdentity(spec);
  if (datumIdentityError) return datumIdentityError;
  const attentionError = validateCanonicalAttentionScopes(spec);
  if (attentionError) return attentionError;
  const serialized = serializeViewSpec(spec);
  const meta = serialized.meta;
  if (meta && Object.keys(meta).some(key => !['object', 'lineage', 'state', 'transition', 'unit', 'annotation'].includes(key))) return 'Bar metadata contains an unsupported field';
  if (meta?.lineage && Object.keys(meta.lineage).some(key => key !== 'key')) return 'Bar lineage metadata contains an unsupported field';
  if (meta?.state && Object.keys(meta.state).some(key => !['selection', 'focus', 'highlight', 'axis', 'detail', 'sceneState', 'scopes'].includes(key))) return 'Bar state metadata contains an unsupported field';
  if (meta?.state?.sceneState && Object.keys(meta.state.sceneState).some(key => !['selection', 'axis', 'detail'].includes(key))) return 'Bar scene metadata contains an unsupported field';
  if (meta?.state?.scopes && Object.keys(meta.state.scopes).some(key => !['focus', 'highlight'].includes(key))) return 'Bar attention metadata contains an unsupported scope';
  if (meta?.object && Object.keys(meta.object).some(key => !['key', 'semantic'].includes(key))) return 'Bar object metadata contains an unsupported field';
  const rows = rowsFrom(serialized.data);
  if (!rows) return 'Bar Grain plans require resolved inline source rows';
  if (!rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) return 'Bar Grain source rows must be records';
  const inputFields = new Set(rows.flatMap(row => Object.keys(row as Record<string, unknown>)));
  let beforeAggregate = inputFields;
  for (let i = 0; i < aggregateIndex; i++) {
    const transform = transforms[i]!;
    const error = validateInputTransform(transform, beforeAggregate);
    if (error) return error;
    if ('timeUnit' in transform) {
      const timeUnit = (transform as { timeUnit: { field: string; unit: string; as?: string } }).timeUnit;
      beforeAggregate.add(timeUnit.as ?? `${timeUnit.field}_${timeUnit.unit}`);
    }
  }
  const aggregateValue = aggregate as AggregateTransform;
  const aggField = aggregateValue.fields?.[0];
  if (!aggField) return 'Bar aggregate measure is missing';
  if (aggField.op !== 'count' && !beforeAggregate.has(aggField.field ?? '')) return `Bar aggregate references unknown input field "${aggField.field}"`;
  for (const field of aggregateValue.groupby ?? []) if (!beforeAggregate.has(field)) return `Bar aggregate references unknown input field "${field}"`;
  const outputFields = new Set([...(aggregateValue.groupby ?? []), aggField.as!]);
  for (let i = aggregateIndex + 1; i < transforms.length; i++) {
    const error = validateOutputTransform(transforms[i]!, outputFields);
    if (error) return error;
  }
  for (const [channel, raw] of Object.entries(spec.encoding ?? {})) {
    for (const entry of Array.isArray(raw) ? raw : [raw]) if (entry?.field && !outputFields.has(entry.field)) return `Bar ${channel} references unknown aggregate output field "${entry.field}"`;
  }
  const scopes = specScopes(spec);
  for (const mode of ['focus', 'highlight'] as const) {
    const scope = scopes?.[mode] as Record<string, unknown> | undefined;
    if (!scope) continue;
    const filters = (scope.filters as unknown[] | undefined) ?? (scope.filter ? [scope.filter] : typeof scope.field === 'string' ? [{ field: scope.field, equal: scope.equal }] : []);
    for (const filter of filters) {
      const field = normalizeFilter(filter).field;
      if (!outputFields.has(field)) return `Bar ${mode} references unknown aggregate output field "${field}"`;
    }
  }
  const state = barState(spec);
  if (!state?.categoryField || !state.measureField) return 'Bar route endpoints require category and measure channels';
  const xType = (spec.encoding?.x as { type?: string } | undefined)?.type;
  const yType = (spec.encoding?.y as { type?: string } | undefined)?.type;
  const xDiscrete = xType === 'nominal' || xType === 'ordinal';
  const yDiscrete = yType === 'nominal' || yType === 'ordinal';
  if (!((xDiscrete && yType === 'quantitative') || (yDiscrete && xType === 'quantitative'))) {
    return 'Bar states require one nominal or ordinal category axis and one quantitative measure axis';
  }
  const expected = barSemanticKey(serialized);
  if (!expected || !deepEqual(meta?.object?.semantic, semanticToMeta(expected))) return 'Bar semantic identity is not derivable from its current category and measure channels';
  return null;
}

function normalizeBar(spec: BarSpec): BarSpec {
  const serialized = serializeViewSpec(spec);
  const semantic = barSemanticKey(serialized);
  return semantic ? withObject(spec, { semantic }) as BarSpec : spec;
}

function barSemanticKey(spec: ViewSpec): SemanticKey | null {
  const encoding = spec.encoding as Record<string, import('../../types/index.js').ChannelSpec | undefined> | undefined;
  const state = barState(spec);
  if (!state?.categoryField || !state.measureField) return null;
  const detail = encoding?.detail;
  const detailField = detail && !Array.isArray(detail) ? detail.field : undefined;
  const entity = typeof detailField === 'string'
    ? [state.categoryField, detailField].sort((a, b) => a.localeCompare(b))
    : state.categoryField;
  return { entity, measure: { value: state.measureField } };
}

function validateInputTransform(transform: TransformSpec, fields: Set<string>): string | null {
  if ('filter' in transform) {
    const filter = (transform as { filter: import('../../types/index.js').FilterSpec }).filter;
    return fields.has(normalizeFilter(filter).field) ? null : `Bar filter references unknown input field "${filter.field}"`;
  }
  if ('sort' in transform) {
    const sort = (transform as { sort: { field?: string; fields?: Array<string | { field: string }> } }).sort;
    const requested = [...(sort.field ? [sort.field] : []), ...(sort.fields ?? []).map((value: string | { field: string }) => typeof value === 'string' ? value : value.field)];
    const missing = requested.find(field => !fields.has(field));
    return missing ? `Bar sort references unknown input field "${missing}"` : null;
  }
  if ('timeUnit' in transform) {
    const timeUnit = (transform as { timeUnit: { field: string } }).timeUnit;
    return fields.has(timeUnit.field) ? null : `Bar timeUnit references unknown input field "${timeUnit.field}"`;
  }
  return 'Bar Grain pipeline contains an unsupported input transform';
}
function validateOutputTransform(transform: TransformSpec, fields: Set<string>): string | null {
  if ('sort' in transform) {
    const sort = (transform as { sort: { field?: string; fields?: Array<string | { field: string }> } }).sort;
    const requested = [...(sort.field ? [sort.field] : []), ...(sort.fields ?? []).map((value: string | { field: string }) => typeof value === 'string' ? value : value.field)];
    const missing = requested.find(field => !fields.has(field));
    return missing ? `Bar sort references unknown aggregate output field "${missing}"` : null;
  }
  return 'Bar Grain only supports sort transforms after aggregate';
}
function rowsFrom(data: unknown): unknown[] | null {
  return Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { values?: unknown[] }).values) ? (data as { values: unknown[] }).values : null;
}
function isAnchor(value: unknown): boolean { return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).__visdeltaBarGrainAnchor === true); }
function sameOperations(left: CanonicalDeclarationOperation[], right: readonly CanonicalDeclarationOperation[]): boolean {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id && deepEqual(item.value, right[index]?.value) && deepEqual(item.path, right[index]?.path) && item.sequence === right[index]?.sequence);
}
function hasAggregate(spec: ViewSpec): boolean { return (spec.transform ?? []).some(transform => 'aggregate' in transform); }

function normalizeOrdinaryBar(spec: BarSpec): BarSpec {
  const serialized = serializeViewSpec(spec);
  const semantic = semanticKeyFromEncoding((serialized.encoding ?? {}) as Record<string, import('../../types/index.js').ChannelSpec>, null);
  const explicit = serialized.meta?.object?.semantic;
  if (explicit && (!semantic || !deepEqual(explicit, semanticToMeta(semantic)))) {
    throw new Error('authored Bar semantic identity conflicts with its category and measure channels');
  }
  return semantic ? withObject(spec, { semantic }) as BarSpec : spec;
}

function validateOrdinaryBar(spec: BarSpec): string | void {
  if (spec.mark !== 'bar') return 'declaration is not a Bar';
  const transformError = validateCanonicalTransformPipeline(spec);
  if (transformError) return `Bar ${transformError}`;
  const encodingError = validateCanonicalEncoding(spec, ['x', 'y', 'color', 'detail', 'tooltip', 'key', 'xOffset', 'yOffset']);
  if (encodingError) return encodingError;
  const state = barState(spec);
  if (!state?.categoryField || !state.measureField) return 'Bar route endpoints require category and measure channels';
  const serialized = serializeViewSpec(spec);
  const meta = serialized.meta;
  if (meta && Object.keys(meta).some(key => !['object', 'lineage', 'state', 'transition', 'unit', 'annotation'].includes(key))) return 'Bar metadata contains an unsupported field';
  if (meta?.lineage && Object.keys(meta.lineage).some(key => key !== 'key')) return 'Bar lineage metadata contains an unsupported field';
  const stateMeta = meta?.state as Record<string, unknown> | undefined;
  if (stateMeta && Object.keys(stateMeta).some(key => !['selection', 'focus', 'highlight', 'axis', 'detail', 'sceneState', 'scopes'].includes(key))) return 'Bar state metadata contains an unsupported field';
  const sceneState = stateMeta?.['sceneState'] as Record<string, unknown> | undefined;
  if (sceneState && Object.keys(sceneState).some(key => !['selection', 'axis', 'detail'].includes(key))) return 'Bar scene metadata contains an unsupported field';
  const scopes = stateMeta?.['scopes'] as Record<string, unknown> | undefined;
  if (scopes && Object.keys(scopes).some(key => !['focus', 'highlight'].includes(key))) return 'Bar attention metadata contains an unsupported scope';
  const attentionError = validateCanonicalAttentionScopes(spec);
  if (attentionError) return attentionError;
  if (meta?.object && Object.keys(meta.object).some(key => !['key', 'semantic'].includes(key))) return 'Bar object metadata contains an unsupported field';
  const missingField = validateCanonicalDataFields(spec);
  if (missingField) return `Bar declaration references unknown inline-data field "${missingField}"`;
  const identityError = validateExplicitSourceDatumIdentity(spec);
  if (identityError) return identityError;
  const domainError = validateCanonicalPositionDomains(spec);
  if (domainError) return domainError;
  const rawData = serialized.data;
  const rows = rowsFrom(rawData) ?? [];
  const typed = resolveSpecDataTypes(spec, rows);
  const encoding = (typed.encoding ?? {}) as Record<string, import('../../types/index.js').ChannelSpec>;
  const xType = encoding.x?.type;
  const yType = encoding.y?.type;
  const xDiscrete = xType === 'nominal' || xType === 'ordinal';
  const yDiscrete = yType === 'nominal' || yType === 'ordinal';
  if (!((xDiscrete && yType === 'quantitative') || (yDiscrete && xType === 'quantitative'))) {
    return 'Bar states require one nominal or ordinal category axis and one quantitative measure axis';
  }
  const expected = semanticKeyFromEncoding(encoding, null);
  if (!expected || !deepEqual(meta?.object?.semantic, semanticToMeta(expected))) return 'Bar semantic identity is not derivable from its current category and measure channels';
}
function unsupported<T>(reason: string): DeclarationCodecResult<T> { return { status: 'unsupported', reason }; }
