import type { AxisSpec, DeclarationOperationCodec, ViewSpec } from '../../types/index.js';
import { createDeclarationOperationCodec, validateCanonicalAttentionScopes, validateCanonicalDataFields, validateCanonicalEncoding, validateCanonicalTransformPipeline, validateExplicitSourceDatumIdentity, deepEqual } from '../../grammar/declaration-operations.js';
import { validateCanonicalPositionDomains } from '../../grammar/declaration-domains.js';
import { serializeViewSpec } from '../../spec-meta.js';
import { UNIT_LAYOUTS, type UnitViewState } from './authoring.js';
import { UNIT_DEFAULTS } from './defaults.js';

/** Unit layout type, columns and position bindings form one complete layout slot.
 * Mark size, quantity and grouping remain independent declarations.
 * Axis metadata mirrors those slots; it is never a second authored operation. */
export function createUnitDeclarationOperationCodec(): DeclarationOperationCodec<UnitViewState> {
  const ordinary = createDeclarationOperationCodec<UnitViewState>({
    allowedRoots: ['mark', 'data', 'encoding', 'transform', 'key', 'datumKey', 'margin', 'unit', 'meta'],
    atomicPaths: [['margin']],
    derivedPaths: [['meta', 'state', 'sceneState', 'axis']],
    normalize: normalizeUnitDeclaration,
    validate: validateUnitDeclaration
  });
  // A chart-owned shadow groups authored fields without changing their public
  // serialization or treating their derived axis mirror as another operation.
  const shadow = createDeclarationOperationCodec<ViewSpec>({
    allowedRoots: ['mark', 'data', 'encoding', 'transform', 'key', 'datumKey', 'margin', 'meta', 'layout'],
    atomicPaths: [['margin'], ['layout']],
    normalize: spec => {
      if (spec.encoding && !Object.keys(spec.encoding).length) delete spec.encoding;
      const state = spec.meta?.state;
      if (state?.sceneState && !Object.keys(state.sceneState).length) delete state.sceneState;
      if (state?.scopes && !Object.keys(state.scopes).length) delete state.scopes;
      if (state && !Object.keys(state).length) delete spec.meta!.state;
      return spec;
    },
    derivedPaths: [['meta', 'state', 'sceneState', 'axis']]
  });
  const codec: DeclarationOperationCodec<UnitViewState> = {
    normalize: ordinary.normalize,
    validate: ordinary.validate,
    decompose(spec) {
      const normalized = ordinary.normalize(spec);
      return normalized.status === 'ok' ? shadow.decompose(toLayoutShadow(normalized.value)) : normalized;
    },
    evaluate(template, operations) {
      const normalized = ordinary.normalize(template);
      if (normalized.status !== 'ok') return normalized;
      const evaluated = shadow.evaluate(toLayoutShadow(normalized.value), operations);
      if (evaluated.status !== 'ok') return evaluated;
      const value = evaluated.value as UnitViewState & { layout?: Record<string, unknown> };
      const layout = value.layout;
      if (!layout || typeof layout !== 'object' || Array.isArray(layout)
          || Object.keys(layout).some(key => !['type', 'columns', 'x', 'y'].includes(key))) {
        return { status: 'unsupported', reason: 'Unit requires a complete layout operation' };
      }
      delete value.layout;
      value.meta = { ...value.meta, unit: { ...value.meta?.unit, layout: layout.type as string,
        ...(layout.columns === undefined ? {} : { columns: layout.columns }) } };
      value.encoding = { ...value.encoding,
        ...(layout.x === undefined ? {} : { x: layout.x }),
        ...(layout.y === undefined ? {} : { y: layout.y }) } as ViewSpec['encoding'];
      const actual = ordinary.normalize(value);
      if (actual.status !== 'ok') return actual;
      const valid = ordinary.validate(actual.value);
      if (valid.status !== 'ok') return valid;
      const roundTrip = codec.decompose(actual.value);
      return roundTrip.status === 'ok' && deepEqual(roundTrip.value, operations) ? actual
        : { status: 'unsupported', reason: 'Unit layout operations must round-trip exactly' };
    }
  };
  return codec;
}

function toLayoutShadow(spec: UnitViewState): ViewSpec {
  const result = serializeViewSpec(spec) as UnitViewState & { layout?: Record<string, unknown> };
  const unit = { ...result.meta!.unit };
  const encoding = { ...result.encoding };
  result.layout = { type: unit.layout,
    ...(unit.columns === undefined ? {} : { columns: unit.columns }),
    ...(encoding.x === undefined ? {} : { x: encoding.x }),
    ...(encoding.y === undefined ? {} : { y: encoding.y }) };
  delete unit.layout; delete unit.columns;
  delete encoding.x; delete encoding.y;
  result.meta = { ...result.meta, unit };
  if (Object.keys(encoding).length) result.encoding = encoding;
  else delete result.encoding;
  return result;
}

function normalizeUnitDeclaration(spec: UnitViewState): UnitViewState {
  const result = serializeViewSpec(spec) as UnitViewState;
  if (result.encoding && Object.keys(result.encoding).length === 0) delete result.encoding;
  const meta = result.meta ?? {};
  if (meta.state?.scopes && Object.keys(meta.state.scopes).length === 0) delete meta.state.scopes;
  const unit: Record<string, unknown> = { ...UNIT_DEFAULTS, ...(meta.unit ?? {}) };
  if (unit.radius !== undefined) {
    if (!result.encoding?.size) result.encoding = { ...result.encoding, size: { value: unit.radius as number } };
    delete unit.radius;
  }
  // A derived mirror with authored order or conflicting values is not safely
  // reconstructible. Do not silently erase a legacy instruction or conflict.
  const oldAxis = meta.state?.sceneState?.axis as Record<string, unknown> | undefined;
  if (oldAxis) {
    for (const [key, value] of Object.entries(oldAxis)) {
      if (!['layout', 'group', 'value', 'x', 'y'].includes(key)) throw new Error('Unit axis instruction is outside the canonical mirror subset');
      const expected = unit[key] ?? null;
      if (value != null && !deepEqual(value, expected)) throw new Error('Unit axis metadata conflicts with its declaration');
    }
  }
  result.meta = {
    ...meta,
    unit,
    state: {
      ...(meta.state ?? {}),
      sceneState: {
        ...(meta.state?.sceneState ?? {}),
        axis: { layout: unit.layout, group: unit['group'] ?? null, value: unit['value'] ?? null } as AxisSpec
      }
    }
  };
  return result;
}

function validateUnitDeclaration(spec: UnitViewState): string | void {
  if (spec.mark !== 'unit') return 'declaration is not a Unit';
  const transformError = validateCanonicalTransformPipeline(spec);
  if (transformError) return transformError;
  const size = spec.encoding?.size;
  if (size && (size.field !== undefined || typeof size.value !== 'number' || !Number.isFinite(size.value) || size.value <= 0 || Object.keys(size).some(key => key !== 'value'))) return 'Unit size requires a positive finite constant';
  const encodingError = validateCanonicalEncoding(spec, ['x', 'y', 'color', 'size', 'tooltip']);
  if (encodingError) return encodingError;
  const serialized = serializeViewSpec(spec);
  const meta = serialized.meta;
  if (meta && Object.keys(meta).some(key => !['object', 'lineage', 'state', 'unit'].includes(key))) return 'Unit metadata is outside the supported declaration subset';
  if (meta?.object && Object.keys(meta.object).some(key => key !== 'key')) return 'Unit object metadata is outside the supported declaration subset';
  if (meta?.lineage && Object.keys(meta.lineage).some(key => key !== 'key')) return 'Unit lineage metadata is outside the supported declaration subset';
  const unit = meta?.unit ?? {};
  if (Object.keys(unit).some(key => !['layout', 'columns', 'radius', 'group', 'value', 'unitValue', 'maxUnits'].includes(key))) return 'Unit metadata is outside the supported declaration subset';
  const layout = unit['layout'] ?? UNIT_DEFAULTS.layout;
  if (typeof layout !== 'string' || !UNIT_LAYOUTS.includes(layout as typeof UNIT_LAYOUTS[number])) return 'Unit layout must be a supported layout name';
  for (const key of ['columns', 'maxUnits']) {
    if (unit[key] !== undefined && (!Number.isSafeInteger(unit[key]) || (unit[key] as number) <= 0)) return `Unit ${key} must be a positive safe integer`;
  }
  for (const key of ['radius', 'unitValue']) {
    if (unit[key] !== undefined && (typeof unit[key] !== 'number' || !Number.isFinite(unit[key]) || (unit[key] as number) <= 0)) return `Unit ${key} must be positive and finite`;
  }
  for (const key of ['group', 'value']) {
    if (unit[key] !== undefined && (typeof unit[key] !== 'string' || !unit[key])) return `Unit ${key} must be a non-empty field name`;
  }
  for (const name of ['x', 'y'] as const) {
    if (spec.encoding?.[name] && !spec.encoding[name]?.field) return `Unit ${name} requires a field binding`;
  }
  const state = meta?.state;
  if (state && Object.keys(state).some(key => !['scopes', 'sceneState'].includes(key))) return 'Unit state is outside the supported declaration subset';
  if (state?.scopes && Object.keys(state.scopes).some(key => !['focus', 'highlight'].includes(key))) return 'only Unit focus and highlight scopes are supported';
  const attentionError = validateCanonicalAttentionScopes(spec);
  if (attentionError) return attentionError;
  const sceneState = state?.sceneState;
  if (sceneState && Object.keys(sceneState).some(key => key !== 'axis')) return 'Unit detail state is outside the supported declaration subset';
  const axis = sceneState?.axis as Record<string, unknown> | undefined;
  if (axis) {
    if (Object.keys(axis).some(key => !['layout', 'group', 'value', 'x', 'y'].includes(key))) return 'Unit axis state is outside the canonical mirror subset';
    for (const [key, value] of Object.entries(axis)) {
      if (value != null && !deepEqual(value, key === 'layout' ? layout : unit[key] ?? null)) return 'Unit axis metadata conflicts with its declaration';
    }
  }
  const identityError = validateExplicitSourceDatumIdentity(spec);
  if (identityError) return identityError;
  if (layout === 'bar' && !unit['group']) return 'Unit bar layout requires a group field';
  if (layout === 'beeswarm' && !spec.encoding?.x?.field) return 'Unit beeswarm layout requires an x field';
  const rows = Array.isArray(serialized.data) ? serialized.data : (serialized.data as { values?: unknown[] } | undefined)?.values;
  if (!Array.isArray(rows)) return 'Unit declaration planning requires resolved inline source rows';
  const fields = ['group', 'value'].flatMap(key => typeof unit[key] === 'string' ? [{ field: unit[key] as string }] : []);
  const missingField = validateCanonicalDataFields({ ...spec, encoding: { ...spec.encoding, tooltip: [...(Array.isArray(spec.encoding?.tooltip) ? spec.encoding.tooltip : spec.encoding?.tooltip ? [spec.encoding.tooltip] : []), ...fields] } });
  if (missingField) return `Unit declaration references unknown inline-data field "${missingField}"`;
  // Force axes are categorical collection anchors even for numeric fields.
  const domainSpec = layout === 'force' ? {
    ...spec,
    encoding: { ...spec.encoding,
      ...(spec.encoding?.x ? { x: { ...spec.encoding.x, type: 'nominal' as const } } : {}),
      ...(spec.encoding?.y ? { y: { ...spec.encoding.y, type: 'nominal' as const } } : {}) }
  } : spec;
  const domainError = validateCanonicalPositionDomains(domainSpec);
  if (domainError) return domainError;
  return undefined;
}
