import { defaultTransition } from './timing.js';
import type {
  FilterSpec,
  SelectionSpec,
  DetailSpec,
  AxisSpec,
  ObjectMeta,
  ChartChangeState,
  SpecMeta,
  ChartStateMeta,
  ResolvedChartState,
  ViewScopes,
  SemanticKey,
  TransformSpec,
  TransitionSpec,
  ViewSpec
} from './types/index.js';

export const SPEC_META_KEY = 'meta';

const INTERNAL_STATE_FIELDS = ['selection', 'detail', 'axis', 'sceneState', 'scopes'] as const;

export function getSpecMeta(spec: ViewSpec | Record<string, unknown>): SpecMeta {
  return mergeSpecMeta((spec as Record<string, unknown>)[SPEC_META_KEY] ?? {});
}

export function withSpecMeta<T extends ViewSpec>(spec: T, extension: Partial<SpecMeta>): T {
  return {
    ...spec,
    [SPEC_META_KEY]: mergeSpecMeta(getSpecMeta(spec), extension)
  };
}

export function serializeViewSpec(spec: ViewSpec): ViewSpec {
  if (!spec) return spec;
  const next = clonePlain(spec) as ViewSpec & Record<string, unknown>;
  const meta = getSpecMeta(next);
  delete (next as Record<string, unknown>)[SPEC_META_KEY];

  if (next.key !== undefined) {
    meta.object = { ...(meta.object ?? {}), key: next.key as ObjectMeta['key'] };
    delete next.key;
  }

  if (next.datumKey !== undefined) {
    meta.lineage = { ...(meta.lineage ?? {}), key: next.datumKey ?? undefined };
    delete next.datumKey;
  }

  if (next.semanticKey !== undefined) {
    meta.object = {
      ...(meta.object ?? {}),
      semantic: semanticToMeta(next.semanticKey as SemanticKey)
    };
    delete next.semanticKey;
  }

  if (next.transition !== undefined) {
    meta.transition = { ...(meta.transition ?? {}), ...clonePlain(next.transition) } as TransitionSpec;
    delete next.transition;
  }

  if (next.unit !== undefined) {
    meta.unit = clonePlain(next.unit) as Record<string, unknown>;
    delete next.unit;
  }

  const state: ChartStateMeta = { ...(meta.state ?? {}) };
  for (const field of INTERNAL_STATE_FIELDS) {
    if ((next as Record<string, unknown>)[field] !== undefined) {
      (state as Record<string, unknown>)[field] = (next as Record<string, unknown>)[field];
      delete (next as Record<string, unknown>)[field];
    }
  }

  const sceneState: ChartChangeState = { ...(state.sceneState ?? {}) };
  delete (next as Record<string, unknown>).barLayout;
  delete (next as Record<string, unknown>).segmentField;
  delete (next as Record<string, unknown>).segmentDomain;
  delete (next as Record<string, unknown>).aggregate;

  if (Object.keys(sceneState).length) state.sceneState = sceneState;
  if (Object.keys(state).length) meta.state = state;

  const metaTransforms = meta.transform;
  if (metaTransforms?.length) {
    next.transform = dedupeArray([...(next.transform ?? []), ...metaTransforms]) as TransformSpec[];
    delete meta.transform;
  }

  pruneDefaultSpecMeta(meta);

  if (typeof next.data === 'string') {
    next.data = { name: next.data };
  }

  if (Object.keys(meta).length) {
    (next as Record<string, unknown>)[SPEC_META_KEY] = meta;
  }

  return next;
}

export function normalizeViewSpec(spec: ViewSpec): ViewSpec & Record<string, unknown> {
  const meta = getSpecMeta(spec);
  const state: ChartStateMeta = meta.state ?? {};
  const object: ObjectMeta = meta.object ?? {};
  const transforms: TransformSpec[] = [
    ...(spec.transform ?? []),
    ...(meta.transform ?? [])
  ];
  const { meta: _meta, ...baseSpec } = spec as ViewSpec & { meta?: SpecMeta };

  return {
    ...baseSpec,
    key: object.key ?? (spec.encoding?.key?.field ?? null) as string | null,
    datumKey: meta.lineage?.key ?? null,
    semanticKey: semanticFromMeta(object.semantic) ?? null,
    transition: (meta.transition ?? {}) as TransitionSpec,
    unit: meta.unit ?? null,
    selection: state.selection ?? null,
    axis: state.axis ?? null,
    detail: state.detail ?? null,
    sceneState: state.sceneState ?? {},
    scopes: state.scopes ?? {},
    ...(transforms.length ? { transform: dedupeArray(transforms) as TransformSpec[] } : {})
  };
}

export function specObjectKey(spec: ViewSpec): string | string[] | null {
  const meta = getSpecMeta(spec);
  return meta.object?.key ?? (spec.encoding?.key?.field as string | undefined) ?? null;
}

export function specDatumKey(spec: ViewSpec): string | string[] | null {
  return getSpecMeta(spec).lineage?.key ?? spec.datumKey ?? null;
}

export function specSemanticKey(spec: ViewSpec): SemanticKey | null {
  const meta = getSpecMeta(spec);
  return semanticFromMeta(meta.object?.semantic) ?? null;
}

export function specTransition(spec: ViewSpec): TransitionSpec {
  const meta = getSpecMeta(spec);
  return meta.transition ?? {};
}

export function specUnit(spec: ViewSpec): Record<string, unknown> | null {
  const meta = getSpecMeta(spec);
  return meta.unit ?? null;
}

export function specState(spec: ViewSpec): ResolvedChartState {
  const meta = getSpecMeta(spec);
  const state: ChartStateMeta = meta.state ?? {};
  return {
    selection: state.selection ?? null,
    axis: state.axis ?? null,
    detail: state.detail ?? null,
    sceneState: state.sceneState ?? {},
    scopes: (state.scopes ?? {}) as ViewScopes
  };
}

export function dataName(dataSpec: unknown): string | null {
  if (typeof dataSpec === 'string') return dataSpec;
  return (dataSpec as { name?: string })?.name ?? null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function mergeSpecMeta(...items: Array<Partial<SpecMeta>>): SpecMeta {
  return items.reduce<SpecMeta>(
    (merged, item) => mergePlain(merged, item ?? {}) as SpecMeta,
    {} as SpecMeta
  );
}

function mergePlain<T extends Record<string, unknown>>(
  base: T,
  next: Partial<T>
): T {
  const merged = { ...clonePlain(base) } as T;
  for (const [key, value] of Object.entries(next ?? {})) {
    if (isPlainObject(value) && isPlainObject((merged as Record<string, unknown>)[key])) {
      (merged as Record<string, unknown>)[key] = mergePlain(
        (merged as Record<string, unknown>)[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      (merged as Record<string, unknown>)[key] = clonePlain(value);
    }
  }
  return merged;
}

function semanticToMeta(semanticKey: SemanticKey = {}): Record<string, unknown> {
  return {
    ...(semanticKey.entity !== undefined ? { entity: semanticPartToMeta(semanticKey.entity) } : {}),
    ...(semanticKey.entities !== undefined ? { entity: semanticPartToMeta(semanticKey.entities) } : {}),
    ...(semanticKey.measure !== undefined ? { measure: semanticPartToMeta(semanticKey.measure) } : {}),
    ...(semanticKey.measures !== undefined ? { measure: semanticPartToMeta(semanticKey.measures) } : {})
  };
}

function semanticFromMeta(semantic: Record<string, unknown> | null | undefined): SemanticKey | null {
  if (!semantic) return null;
  return {
    ...(semantic.entity !== undefined ? { entity: semanticPartFromMeta(semantic.entity) as SemanticKey['entity'] } : {}),
    ...(semantic.measure !== undefined ? { measure: semanticPartFromMeta(semantic.measure) as SemanticKey['measure'] } : {})
  };
}

function semanticPartToMeta(part: unknown): unknown {
  if (Array.isArray(part)) return part.map(semanticPartToMeta);
  if (typeof part === 'string') return { field: part };
  return clonePlain(part);
}

function semanticPartFromMeta(part: unknown): unknown {
  if (Array.isArray(part)) return part.map(semanticPartFromMeta);
  const p = part as Record<string, unknown> | null;
  if (p?.field) return p.field;
  if (p?.value) return { value: p.value };
  return clonePlain(part);
}

function pruneDefaultSpecMeta(meta: SpecMeta): void {
  if (meta.transition !== undefined) {
    const pruned = diffFromDefaultTransition(meta.transition);
    if (!Object.keys(pruned).length) {
      delete meta.transition;
    } else {
      meta.transition = pruned;
    }
  }
}

function diffFromDefaultTransition(transition: TransitionSpec): Partial<TransitionSpec> {
  const defaults = defaultTransition();
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(transition ?? {})) {
    if (
      key === 'stagger' &&
      isPlainObject(value) &&
      isPlainObject(defaults.stagger)
    ) {
      const staggerDiff = diffPlain(
        value as Record<string, unknown>,
        defaults.stagger as Record<string, unknown>
      );
      if (Object.keys(staggerDiff).length) diff.stagger = staggerDiff;
    } else if (!sameValue(value, (defaults as Record<string, unknown>)[key])) {
      diff[key] = clonePlain(value);
    }
  }
  return diff as Partial<TransitionSpec>;
}

function diffPlain(
  value: Record<string, unknown>,
  defaults: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value ?? {})) {
    if (!sameValue(child, defaults[key])) result[key] = clonePlain(child);
  }
  return result;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function clonePlain<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function dedupeArray<T>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value ?? null);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
