import type { AggregateTransform, DeclarationCodecResult, DeclarationOperationCodec, ViewSpec } from '../../types/index.js';
import type { PointViewState } from './authoring.js';
import { createDeclarationOperationCodec, createStandardDeclarationOperationCodec, deepEqual, validateCanonicalAttentionScopes, validateCanonicalEncoding, validateExplicitSourceDatumIdentity } from '../../grammar/declaration-operations.js';
import { validateCanonicalPositionDomains } from '../../grammar/declaration-domains.js';
import { validateTransforms } from '../../data/validate.js';
import { normalizeFilter } from '../../data/filter.js';
import { serializeViewSpec, specScopes } from '../../spec-meta.js';

const ROOT = '__visdeltaPointGrain';
const ANCHOR = { __visdeltaPointGrainAnchor: true };
const CHANNELS = ['x', 'y', 'color', 'size', 'tooltip', 'key'];
const ROOTS = ['mark', 'data', 'encoding', 'transform', 'key', 'datumKey', 'margin', 'meta', 'size', 'connector'];
type Measure = NonNullable<AggregateTransform['fields']>[number];
type Grain = { grouping: string[]; measures: { fields: Measure[] } };

/** Point owns its two-position rollup and optional aggregate-size semantics. */
export function createPointDeclarationOperationCodec(): DeclarationOperationCodec<PointViewState> {
  const ordinaryValidator = createStandardDeclarationOperationCodec<PointViewState>({
    mark: 'point', requiredChannels: ['x', 'y'], allowedChannels: CHANNELS,
    allowedRoots: ROOTS, atomicPaths: [['connector']], validate: validatePresentation
  });
  const ordinary = createDeclarationOperationCodec<PointViewState>({
    allowedRoots: ROOTS, atomicPaths: [['margin'], ['connector']], normalize: normalizePointDeclaration,
    validate: spec => { const result = ordinaryValidator.validate(spec); return result.status === 'unsupported' ? result.reason : undefined; }
  });
  const shadow = createDeclarationOperationCodec<ViewSpec>({
    allowedRoots: [...ROOTS, ROOT],
    atomicPaths: [['margin'], ['connector'], [ROOT, 'grouping'], [ROOT, 'measures']],
    normalize: pruneEmptyAttentionContainers
  });
  const codec: DeclarationOperationCodec<PointViewState> = {
    supportsTransition(from, to) {
      if (hasAggregate(from) !== hasAggregate(to)) return 'Point raw/summary routes require the chart-authored detail transition';
    },
    normalize(spec) {
      if (!hasAggregate(spec)) return ordinary.normalize(spec);
      const reason = validateSummary(spec);
      return reason ? unsupported(reason) : ok(normalizePointDeclaration(spec));
    },
    validate(spec) {
      if (!hasAggregate(spec)) return ordinary.validate(spec);
      const reason = validateSummary(spec);
      return reason ? unsupported(reason) : ok(undefined);
    },
    decompose(spec) {
      if (!hasAggregate(spec)) {
        const normalized = ordinary.normalize(spec);
        return normalized.status === 'ok' ? ordinary.decompose(normalized.value) : normalized;
      }
      const reason = validateSummary(spec);
      if (reason) return unsupported(reason);
      return shadow.decompose(toShadow(spec));
    },
    evaluate(template, operations) {
      if (!hasAggregate(template)) return ordinary.evaluate(template, operations);
      const reason = validateSummary(template);
      if (reason) return unsupported(reason);
      const evaluated = shadow.evaluate(toShadow(template), operations);
      if (evaluated.status !== 'ok') return evaluated;
      const actual = fromShadow(evaluated.value);
      if (actual.status !== 'ok') return actual;
      const validation = codec.validate(actual.value);
      if (validation.status !== 'ok') return validation;
      const roundTrip = codec.decompose(actual.value);
      if (roundTrip.status !== 'ok' || !deepEqual(roundTrip.value, operations)) return unsupported('Point Grain operations must round-trip exactly');
      return actual;
    }
  };
  return codec;
}

function toShadow(spec: PointViewState): ViewSpec {
  const value = normalizePointDeclaration(spec) as ViewSpec & Record<string, unknown>;
  const index = value.transform!.findIndex(item => 'aggregate' in item);
  const aggregate = (value.transform![index] as { aggregate: AggregateTransform }).aggregate;
  const grain: Grain = { grouping: [...aggregate.groupby!], measures: { fields: aggregate.fields! } };
  value.transform![index] = { ...ANCHOR };
  for (const channel of ['x', 'y'] as const) {
    const attributes = { ...value.encoding![channel] };
    delete attributes.field;
    value.encoding![channel] = attributes;
  }
  const sizeAttributes = { ...value.encoding!.size };
  delete sizeAttributes.field;
  delete sizeAttributes.type;
  if (Object.keys(sizeAttributes).length) value.encoding!.size = sizeAttributes;
  else delete value.encoding!.size;
  delete value.meta!.object;
  delete value.meta!.state!.sceneState!.detail;
  if (!Object.keys(value.meta!.state!.sceneState!).length) delete value.meta!.state!.sceneState;
  if (!Object.keys(value.meta!.state!).length) delete value.meta!.state;
  if (!Object.keys(value.meta!).length) delete value.meta;
  value[ROOT] = grain;
  return pruneEmptyAttentionContainers(value);
}

function fromShadow(input: ViewSpec): DeclarationCodecResult<PointViewState> {
  const value = serializeViewSpec(input) as ViewSpec & Record<string, unknown>;
  const grain = value[ROOT] as Grain | undefined;
  if (!grain?.grouping || !grain.measures?.fields) return unsupported('Point Grain operation state is incomplete');
  const anchors = (value.transform ?? []).flatMap((item, index) => (item as Record<string, unknown>).__visdeltaPointGrainAnchor === true ? [index] : []);
  if (anchors.length !== 1) return unsupported('Point aggregate position must remain fixed');
  value.transform![anchors[0]!] = { aggregate: { groupby: grain.grouping, fields: grain.measures.fields } };
  delete value[ROOT];
  value.encoding ??= {};
  for (const [index, channel] of ['x', 'y'].entries()) {
    const field = grain.measures.fields[index]?.as;
    if (!field) return unsupported('Point rollup needs both position measures');
    value.encoding[channel] = { ...value.encoding[channel], field };
  }
  const size = grain.measures.fields[2];
  if (size) value.encoding.size = { ...value.encoding.size, field: size.as, type: 'quantitative' };
  else if (value.encoding.size) return unsupported('Point size attributes require a complete size measure');
  const detail = { mode: 'aggregate', groupby: grain.grouping, ...(grain.measures.fields[2] ? { size: grain.measures.fields[2] } : {}) };
  value.meta ??= {};
  value.meta.object = { key: grain.grouping.length === 1 ? grain.grouping[0] : grain.grouping };
  value.meta.state ??= {};
  value.meta.state.sceneState = { ...value.meta.state.sceneState, detail };
  return ok(normalizePointDeclaration(value as PointViewState));
}

function validateSummary(spec: PointViewState): string | undefined {
  if (spec.mark !== 'point') return 'declaration is not a Point';
  if (Object.keys(spec).some(key => !ROOTS.includes(key))) return 'Point summary contains an unsupported declaration field';
  try { validateTransforms(spec.transform ?? []); } catch (error) { return (error as Error).message; }
  const transforms = spec.transform ?? [];
  const indices = transforms.flatMap((item, index) => 'aggregate' in item ? [index] : []);
  if (indices.length !== 1) return 'Point Grain plans require exactly one aggregate';
  const index = indices[0]!;
  const aggregate = (transforms[index] as { aggregate: AggregateTransform }).aggregate;
  const groupby = aggregate.groupby ?? [];
  const measures = aggregate.fields ?? [];
  if (!groupby.length || new Set(groupby).size !== groupby.length) return 'Point summary requires a nonempty unique groupby';
  if (measures.length < 2 || measures.length > 3 || measures.some(item => !item.op || !item.as)) return 'Point summary requires x/y measures and an optional size measure with explicit operators and aliases';
  const aliases = measures.map(item => item.as!);
  if (new Set(aliases).size !== aliases.length || aliases.some(field => groupby.includes(field))) return 'Point aggregate aliases must be unique and must not overwrite grouping fields';
  for (const [at, channel] of ['x', 'y'].entries()) {
    const binding = spec.encoding?.[channel];
    if (!binding || Array.isArray(binding) || binding.field !== measures[at]!.as || binding.type !== 'quantitative') return 'Point x/y channels must bind their ordered quantitative aggregate measures';
  }
  const size = spec.encoding?.size;
  if (measures[2] ? size?.field !== measures[2].as || size?.type !== 'quantitative' : size !== undefined) return 'Point aggregate size must match its optional third measure';
  const serialized = serializeViewSpec(spec);
  const expectedKey = groupby.length === 1 ? groupby[0] : groupby;
  if (!deepEqual(serialized.meta?.object, { key: expectedKey })) return 'Point summary mark key must match its full grouping';
  const detail = { mode: 'aggregate', groupby, ...(measures[2] ? { size: measures[2] } : {}) };
  if (!deepEqual(serialized.meta?.state?.sceneState?.detail, detail)) return 'Point summary detail metadata must match its aggregate';
  const meta = serialized.meta;
  if (meta && Object.keys(meta).some(key => !['object', 'lineage', 'state'].includes(key))) return 'Point summary metadata is outside the canonical subset';
  if (meta?.lineage && Object.keys(meta.lineage).some(key => key !== 'key')) return 'Point lineage metadata is outside the canonical subset';
  if (meta?.state && Object.keys(meta.state).some(key => !['sceneState', 'scopes'].includes(key))) return 'Point summary state metadata is outside the canonical subset';
  if (meta?.state?.sceneState && Object.keys(meta.state.sceneState).some(key => key !== 'detail')) return 'Point runtime detail views and coordinate scenes require chart-authored routes';
  if (meta?.state?.scopes && Object.keys(meta.state.scopes).some(key => !['focus', 'highlight'].includes(key))) return 'Point summary supports focus and highlight scopes only';
  const common = validateCanonicalEncoding(spec, CHANNELS) || validateCanonicalPositionDomains(spec) || validateCanonicalAttentionScopes(spec) || validateExplicitSourceDatumIdentity(spec);
  if (common) return common;
  const data = serialized.data;
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' && 'values' in data ? data.values : null;
  if (!Array.isArray(rows) || !rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) return 'Point Grain plans require resolved inline source records';
  let fields = new Set(rows.flatMap(row => Object.keys(row)));
  for (const [at, transform] of transforms.entries()) {
    if (at === index) {
      const missing = [...groupby, ...measures.flatMap(item => item.field ? [item.field] : [])].find(field => !fields.has(field));
      if (missing) return `Point aggregate references unknown input field "${missing}"`;
      fields = new Set([...groupby, ...aliases]);
      continue;
    }
    if ('filter' in transform && at < index) {
      if (!fields.has(normalizeFilter(transform.filter).field)) return 'Point filter references an unavailable input field';
    } else if ('timeUnit' in transform && at < index) {
      const unit = transform.timeUnit as { field: string; unit: string; as?: string };
      if (!fields.has(unit.field)) return 'Point timeUnit references an unavailable input field';
      fields.add(unit.as ?? `${unit.field}_${unit.unit}`);
    } else if ('sort' in transform) {
      const sort = transform.sort as { field?: string; fields?: Array<string | { field: string }> };
      if ([...(sort.field ? [sort.field] : []), ...(sort.fields ?? []).map(item => typeof item === 'string' ? item : item.field)].some(field => !fields.has(field))) return 'Point sort references an unavailable field';
    } else return 'Point Grain supports filter/sort/timeUnit before aggregate and sort after aggregate';
  }
  for (const raw of Object.values(spec.encoding ?? {})) for (const channel of Array.isArray(raw) ? raw : [raw]) {
    if (channel?.field && !fields.has(channel.field)) return `Point encoding references unknown aggregate output field "${channel.field}"`;
  }
  for (const scope of Object.values(specScopes(spec))) {
    const value = scope as { filters?: unknown[]; filter?: unknown; field?: string; equal?: unknown } | null;
    for (const filter of value?.filters ?? (value?.filter ? [value.filter] : value?.field ? [{ field: value.field, equal: value.equal }] : [])) {
      if (!fields.has(normalizeFilter(filter).field)) return 'Point attention references an unavailable aggregate output field';
    }
  }
  return validatePresentation(spec, fields);
}

function validatePresentation(spec: PointViewState, fields?: Set<string>): string | undefined {
  if (spec.size !== undefined && (!Number.isFinite(spec.size) || spec.size <= 0)) return 'Point radius must be positive and finite';
  if (!spec.connector) return;
  const connector = spec.connector;
  if (Object.keys(connector).some(key => !['from', 'channel', 'by', 'orderBy'].includes(key))) return 'Point connector contains unsupported properties';
  const hasBaseline = typeof connector.from === 'number' && Number.isFinite(connector.from);
  const groups = Array.isArray(connector.by) ? connector.by : connector.by ? [connector.by] : [];
  if (connector.from !== undefined && !hasBaseline) return 'Point connector baseline must be finite';
  if (hasBaseline === (groups.length > 0)) return 'Point connector requires either finite baseline or grouping';
  if (connector.channel && (!hasBaseline || !['x', 'y'].includes(connector.channel))) return 'Point connector channel requires a baseline';
  if (connector.orderBy && !groups.length) return 'Point connector ordering requires grouping';
  if (!groups.length) {
    const quantitative = (['x', 'y'] as const).filter(channel => spec.encoding?.[channel]?.field && spec.encoding[channel]?.type === 'quantitative');
    const channel = connector.channel ?? (quantitative.length === 1 ? quantitative[0] : undefined);
    if (!channel || !quantitative.includes(channel)) return 'Point baseline connector requires an unambiguous quantitative positional channel';
    return;
  }
  if (!fields) {
    const data = serializeViewSpec(spec).data;
    const rows = Array.isArray(data) ? data : data && typeof data === 'object' && 'values' in data ? data.values : null;
    if (!Array.isArray(rows)) return 'Point connector field validation requires inline data';
    fields = new Set(rows.flatMap(row => Object.keys(row)));
    for (const transform of spec.transform ?? []) if ('timeUnit' in transform) {
      const unit = transform.timeUnit as { field: string; unit: string; as?: string };
      fields.add(unit.as ?? `${unit.field}_${unit.unit}`);
    }
  }
  if ([...groups, ...(connector.orderBy ? [connector.orderBy] : [])].some(field => typeof field !== 'string' || !fields!.has(field))) return 'Point connector references an unavailable field';
}

function hasAggregate(spec: ViewSpec): boolean { return (spec.transform ?? []).some(item => 'aggregate' in item); }
/** Only renderer-proven aliases; data/theme-dependent radius defaults stay authored. */
export function normalizePointDeclaration(spec: PointViewState): PointViewState {
  const value = serializeViewSpec(spec) as PointViewState;
  if (value.connector === null) delete value.connector;
  const connector = value.connector;
  if (connector?.by && Array.isArray(connector.by) && connector.by.length === 1) connector.by = connector.by[0]!;
  if (connector && typeof connector.from === 'number' && Number.isFinite(connector.from) && !connector.channel) {
    const channels = (['x', 'y'] as const).filter(channel => value.encoding?.[channel]?.field && value.encoding[channel]?.type === 'quantitative');
    if (channels.length === 1) connector.channel = channels[0];
  }
  return pruneEmptyAttentionContainers(value) as PointViewState;
}
function pruneEmptyAttentionContainers(spec: ViewSpec): ViewSpec {
  if (spec.meta?.state?.scopes && !Object.keys(spec.meta.state.scopes).length) delete spec.meta.state.scopes;
  if (spec.meta?.state && !Object.keys(spec.meta.state).length) delete spec.meta.state;
  if (spec.meta && !Object.keys(spec.meta).length) delete spec.meta;
  return spec;
}
function ok<T>(value: T): DeclarationCodecResult<T> { return { status: 'ok', value }; }
function unsupported<T>(reason: string): DeclarationCodecResult<T> { return { status: 'unsupported', reason }; }
