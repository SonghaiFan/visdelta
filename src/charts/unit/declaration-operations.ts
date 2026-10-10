import type { AxisSpec, DeclarationOperationCodec } from '../../types/index.js';
import { createDeclarationOperationCodec, validateCanonicalAttentionScopes, validateCanonicalDataFields, validateCanonicalEncoding, validateCanonicalTransformPipeline, validateExplicitSourceDatumIdentity, deepEqual } from '../../grammar/declaration-operations.js';
import { validateCanonicalPositionDomains } from '../../grammar/declaration-domains.js';
import { serializeViewSpec } from '../../spec-meta.js';
import { UNIT_LAYOUTS, type UnitViewState } from './authoring.js';
import { UNIT_DEFAULTS } from './defaults.js';

/** Unit quantity, grouping and layout slots remain independent declarations.
 * Axis metadata mirrors those slots; it is never a second authored operation. */
export function createUnitDeclarationOperationCodec(): DeclarationOperationCodec<UnitViewState> {
  return createDeclarationOperationCodec<UnitViewState>({
    allowedRoots: ['mark', 'data', 'encoding', 'transform', 'key', 'datumKey', 'margin', 'unit', 'meta'],
    atomicPaths: [['margin']],
    derivedPaths: [['meta', 'state', 'sceneState', 'axis']],
    normalize: normalizeUnitDeclaration,
    validate: validateUnitDeclaration
  });
}

function normalizeUnitDeclaration(spec: UnitViewState): UnitViewState {
  const result = serializeViewSpec(spec) as UnitViewState;
  if (result.encoding && Object.keys(result.encoding).length === 0) delete result.encoding;
  const meta = result.meta ?? {};
  if (meta.state?.scopes && Object.keys(meta.state.scopes).length === 0) delete meta.state.scopes;
  const unit: Record<string, unknown> = { ...UNIT_DEFAULTS, ...(meta.unit ?? {}) };
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
  const encodingError = validateCanonicalEncoding(spec, ['x', 'y', 'color', 'tooltip']);
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
