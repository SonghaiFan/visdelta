import { cloneState } from '../grammar/view-state.js';
import type {
  ChannelSpec,
  FilterSpec,
  SelectionSpec,
  SemanticKey,
  ViewSpec
} from '../types/index.js';
import { specObjectKey, withSpecMeta } from '../spec-meta.js';
import { titleize } from '../labels.js';
import { normalizeFilter } from '../data/filter.js';

type AnyRecord = Record<string, unknown>;

interface ObjectSpec {
  key?: string | string[] | null;
  semantic?: SemanticKey;
}

interface AxisOrder {
  order: string[];
  duration?: number;
  stagger?: unknown;
}

export function compileFilter(spec: ViewSpec, operationSpec: SelectionSpec = {}): ViewSpec {
  const filter = operationSpec.filter ? normalizeFilter(operationSpec.filter) : selectorToFilter(operationSpec);
  if (!filter) return spec;
  return withSceneState({
    ...spec,
    transform: [{ filter }, ...(spec.transform || [])]
  }, { selection: { filter } });
}

export function compileHighlight(spec: ViewSpec, operationSpec: SelectionSpec = {}): ViewSpec {
  const filter = operationSpec.filter ? normalizeFilter(operationSpec.filter) : selectorToFilter(operationSpec);
  if (!filter) return spec;
  return withSceneState(spec, {
    selection: {
      mode: 'highlight',
      filter,
      ...(operationSpec.opacity != null ? { opacity: operationSpec.opacity } : {})
    }
  });
}

export function compileFocus(spec: ViewSpec, operationSpec: SelectionSpec = {}): ViewSpec {
  const filter = operationSpec.filter ? normalizeFilter(operationSpec.filter) : selectorToFilter(operationSpec);
  if (!filter) return spec;
  return withSceneState(spec, {
    selection: {
      mode: 'focus',
      filter
    }
  });
}

export function compileCartesianCoordinate(spec: ViewSpec, operationSpec: AnyRecord = {}): ViewSpec {
  const encoding = cloneEncoding(spec.encoding);
  const shouldFlip = Boolean(operationSpec['flip']);

  if (shouldFlip) {
    [encoding['x'], encoding['y']] = [encoding['y'], encoding['x']];
  }

  if (operationSpec['x']) encoding['x'] = mergeXYChannel(encoding['x'] as ChannelSpec, operationSpec['x'] as ChannelSpec, 'quantitative');
  if (operationSpec['y']) encoding['y'] = mergeXYChannel(encoding['y'] as ChannelSpec, operationSpec['y'] as ChannelSpec, 'quantitative');

  return withSceneState(withObject({ ...spec, encoding }, {
    key: (operationSpec['key'] as string) || specObjectKey(spec)
  }), {
    axis: {
      flip: shouldFlip,
      xScale: channelScaleType(encoding['x'] as ChannelSpec),
      yScale: channelScaleType(encoding['y'] as ChannelSpec),
      ...resolveAxisOrder(operationSpec as AnyRecord, 'cartesian')
    }
  });
}

export function identitySpec(spec: ViewSpec): ViewSpec {
  return spec;
}

export function withObject(spec: ViewSpec, objectSpec: ObjectSpec = {}): ViewSpec {
  const object: AnyRecord = {};
  if (objectSpec.key != null) object['key'] = objectSpec.key;
  if (objectSpec.semantic != null) object['semantic'] = semanticToMeta(objectSpec.semantic);
  return Object.keys(object).length ? withSpecMeta(spec, { object: object as AnyRecord }) : spec;
}

export function withSceneState(spec: ViewSpec, sceneStatePatch: AnyRecord = {}): ViewSpec {
  return withSpecMeta(spec, { state: { sceneState: sceneStatePatch } });
}

export function semanticToMeta(semanticKey: SemanticKey = {}): AnyRecord {
  const sk = semanticKey as AnyRecord;
  return {
    ...(sk['entity'] !== undefined ? { entity: semanticPartToMeta(sk['entity']) } : {}),
    ...(sk['entities'] !== undefined ? { entity: semanticPartToMeta(sk['entities']) } : {}),
    ...(sk['measure'] !== undefined ? { measure: semanticPartToMeta(sk['measure']) } : {}),
    ...(sk['measures'] !== undefined ? { measure: semanticPartToMeta(sk['measures']) } : {})
  };
}

export function semanticPartToMeta(part: unknown): unknown {
  if (Array.isArray(part)) return part.map(semanticPartToMeta);
  if (typeof part === 'string') return { field: part };
  if (part == null || typeof part !== 'object') return part;
  return { ...(part as AnyRecord) };
}

export function selectorToFilter(selector: AnyRecord = {}): FilterSpec | null {
  if (!selector['field']) return null;
  return normalizeFilter({
    field: selector['field'] as string,
    ...copyDefined(selector, ['equal', 'notEqual', 'oneOf', 'gte', 'gt', 'lte', 'lt'])
  });
}

export function resolveAxisOrder(axisSpec: AnyRecord = {}, orientation: string): AxisOrder {
  return {
    order: (axisSpec['order'] as string[]) ||
      (orientation === 'horizontal' ? ['y', 'x'] : ['x', 'y']),
    duration: axisSpec['duration'] as number,
    stagger: axisSpec['stagger']
  };
}

export function channelFromField(
  fieldOrChannel: string | ChannelSpec,
  title: string | null,
  fallbackType: string
): ChannelSpec {
  if (fieldOrChannel && typeof fieldOrChannel === 'object') {
    const channel = { ...fieldOrChannel } as ChannelSpec & { type?: string; title?: string };
    if (!channel.type) channel.type = fallbackType as ChannelSpec['type'];
    if (channel.field && !channel.title) channel.title = titleize(channel.field);
    return channel;
  }
  return {
    field: fieldOrChannel as string,
    type: fallbackType as ChannelSpec['type'],
    title: title || titleize(fieldOrChannel as string)
  };
}

export function mergeXYChannel(
  base: ChannelSpec = {},
  override: string | ChannelSpec = {},
  fallbackType: string
): ChannelSpec {
  if (typeof override === 'string') return channelFromField(override, null, fallbackType);
  const channel = { ...base, ...override } as ChannelSpec & { type?: string; title?: string; scale?: AnyRecord };
  if (!channel.type) channel.type = fallbackType as ChannelSpec['type'];
  if (channel.field && (!channel.title || (override as ChannelSpec).field)) {
    channel.title = (override as ChannelSpec & { title?: string }).title || titleize(channel.field);
  }
  if ((override as ChannelSpec & { scale?: AnyRecord }).scale || (base as ChannelSpec & { scale?: AnyRecord }).scale) {
    channel.scale = {
      ...((base as ChannelSpec & { scale?: AnyRecord }).scale || {}),
      ...((override as ChannelSpec & { scale?: AnyRecord }).scale || {})
    };
  }
  return channel;
}

export function channelScaleType(channel: ChannelSpec = {}): string {
  const ch = channel as ChannelSpec & { scale?: { type?: string }; scaleType?: string };
  return ch.scale?.type || ch.scaleType || 'linear';
}

export function aggregateFieldSpec(
  channelSpec: ChannelSpec = {},
  fallbackField: string,
  fallbackAs: string,
  fallbackOp: string
): { op: string; field: string; as: string } {
  const ch = channelSpec as ChannelSpec & { op?: string; as?: string };
  return {
    op: ch.op || fallbackOp,
    field: ch.field || fallbackField,
    as: ch.as || fallbackAs
  };
}

export function cloneViewSpec(viewSpec: ViewSpec): ViewSpec {
  return cloneState(viewSpec);
}

export function cloneEncoding(encoding: ViewSpec['encoding'] = {}): Record<string, ChannelSpec | ChannelSpec[]> {
  return Object.fromEntries(
    Object.entries(encoding || {}).map(([channel, channelSpec]) => [
      channel,
      Array.isArray(channelSpec)
        ? channelSpec.map((item) => ({ ...item }))
        : { ...(channelSpec as ChannelSpec) }
    ])
  );
}

export function copyDefined(source: AnyRecord, keys: string[]): AnyRecord {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}
