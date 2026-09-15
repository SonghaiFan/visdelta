import type { BarOrientation, ChannelSpec, SemanticKey, SemanticKeyPart, SpecCompiler, ViewSpec } from '../../types/index.js';
import {
  specObjectKey,
  specSemanticKey,
  specState
} from '../../spec-meta.js';
import {
  barOffsetChannelName,
  barOrientationFromEncoding
} from './layout/index.js';
import { barSegmentField } from './semantic.js';
import {
  channelFromField,
  cloneEncoding,
  compileFilter,
  compileFocus,
  compileHighlight,
  identitySpec,
  resolveAxisOrder,
  withObject,
  withSceneState
} from '../compiler-utils.js';

type AnyRecord = Record<string, unknown>;
type Encoding = Record<string, ChannelSpec>;

export function createBarSpecCompiler(_context: AnyRecord = {}): SpecCompiler {
  return {
    base: compileBarBase,
    operations: {
      filter: compileFilter,
      focus: compileFocus,
      highlight: compileHighlight,
      coordinate: compileBarCoordinate,
      scale: compileBarScale,
      aggregate: compileBarAggregate,
      layout: compileBarLayout
    }
  };
}

function compileBarBase(spec: ViewSpec, _context: AnyRecord = {}): ViewSpec {
  return withDefaultBarSemanticKey(identitySpec(spec));
}

function compileBarCoordinate(spec: ViewSpec, axisSpec: AnyRecord = {}, _context: AnyRecord = {}): ViewSpec {
  let workingSpec = spec;
  const layout = (axisSpec['layout'] as string) || null;
  const flipsOrientation = Boolean(axisSpec['flip']);

  if (axisSpec['layout']) {
    const segmentField = barSegmentField(workingSpec);
    const state = specState(workingSpec);
    const stateRecord = state as unknown as AnyRecord;
    const detail = (stateRecord['sceneState'] as AnyRecord | undefined)?.['detail'] || stateRecord['detail'] || {};
    const orientation: BarOrientation = flipsOrientation
      ? oppositeOrientation(barOrientationFromEncoding(workingSpec.encoding as Encoding || {}))
      : barOrientationFromEncoding(workingSpec.encoding as Encoding || {});
    workingSpec = withSceneState({
      ...workingSpec,
      encoding: encodingWithBarLayout(workingSpec.encoding as Encoding, layout, segmentField, orientation) as ViewSpec['encoding']
    }, {
      axis: { layout, ...resolveAxisOrder(axisSpec, orientation) },
      ...(segmentField ? { detail: { ...(detail as AnyRecord), layout } } : {})
    });

    if (!flipsOrientation && !axisSpec['scale']) return workingSpec;
  }

  let encoding = cloneEncoding(workingSpec.encoding) as Encoding;
  const currentOrientation = barOrientationFromEncoding(encoding);
  const catCh = categoryChannel(encoding);
  const measCh = measureChannel(encoding);
  const category = channelFromField(catCh as ChannelSpec, (catCh as ChannelSpec)?.title || null, 'nominal');
  const measure = channelFromField(measCh as ChannelSpec, (measCh as ChannelSpec)?.title || null, 'quantitative');
  const orientation: BarOrientation = flipsOrientation ? oppositeOrientation(currentOrientation) : currentOrientation;

  if (orientation === 'horizontal') {
    encoding['x'] = { ...measure, ...((axisSpec['scale'] as AnyRecord | undefined) ? { domain: (axisSpec['scale'] as AnyRecord)['domain'] as unknown[] } : {}) };
    encoding['y'] = category;
  } else {
    encoding['x'] = category;
    encoding['y'] = { ...measure, ...((axisSpec['scale'] as AnyRecord | undefined) ? { domain: (axisSpec['scale'] as AnyRecord)['domain'] as unknown[] } : {}) };
  }

  const state = specState(workingSpec);
  const stateRecord = state as unknown as AnyRecord;
  const resolvedLayout =
    layout ||
    (stateRecord['sceneState'] as AnyRecord | undefined)?.['detail'] as AnyRecord | undefined && ((stateRecord['sceneState'] as AnyRecord)['detail'] as AnyRecord)?.['layout'] ||
    (stateRecord['detail'] as AnyRecord | undefined)?.['layout'] ||
    (stateRecord['sceneState'] as AnyRecord | undefined)?.['axis'] as AnyRecord | undefined && ((stateRecord['sceneState'] as AnyRecord)['axis'] as AnyRecord)?.['layout'] ||
    (stateRecord['axis'] as AnyRecord | undefined)?.['layout'] ||
    null;

  encoding = encodingWithBarLayout(encoding, resolvedLayout as string | null, barSegmentField(workingSpec), orientation) as Encoding;

  return withSceneState(withObject({
    ...workingSpec,
    margin: {
      ...(orientation === 'horizontal' ? { left: 86, right: 42 } : {}),
      ...((workingSpec as AnyRecord)['margin'] || {})
    },
    encoding: encoding as ViewSpec['encoding']
  }, {
    key: (axisSpec['key'] as string) || specObjectKey(workingSpec) as string || (category as ChannelSpec).field || ''
  }), {
    axis: {
      ...(resolvedLayout ? { layout: resolvedLayout } : {}),
      orientation,
      ...(flipsOrientation ? { flip: true } : {}),
      scale: axisSpec['scale'] || null,
      ...resolveAxisOrder(axisSpec, orientation)
    }
  });
}

function compileBarScale(spec: ViewSpec, operationSpec: AnyRecord = {}, context: AnyRecord = {}): ViewSpec {
  return compileBarCoordinate(spec, operationSpec, context);
}

function compileBarLayout(spec: ViewSpec, operationSpec: AnyRecord = {}, context: AnyRecord = {}): ViewSpec {
  return compileBarCoordinate(spec, operationSpec, context);
}

function compileBarAggregate(spec: ViewSpec, detailSpec: AnyRecord = {}, _context: AnyRecord = {}): ViewSpec {
  const encoding = spec.encoding as Encoding || {};
  const categoryField = (detailSpec['category'] as string) || (encoding['x'] as ChannelSpec)?.field || 'category';
  const segmentField = (detailSpec['segment'] as string) || (detailSpec['segmentAs'] as string) || 'segment';
  const valueField = (detailSpec['value'] as string) || (detailSpec['valueAs'] as string) || (encoding['y'] as ChannelSpec)?.field || 'value';
  const sourceField = (detailSpec['source'] as string) || (detailSpec['sourceAs'] as string) || '__measure';
  const fields = (detailSpec['fields'] as string[]) || [];
  const labels = (detailSpec['labels'] as Record<string, string>) || {};
  const segmentDomain = (detailSpec['domain'] as string[]) ||
    ((detailSpec['color'] as AnyRecord | undefined)?.['domain'] as string[]) ||
    fields.map((field) => labels[field] || field);
  const groupby = (detailSpec['groupby'] as string[]) || [categoryField, sourceField, segmentField];
  const transform = [...(spec.transform || [])];

  if (fields.length) {
    transform.push({ fold: { fields, as: [segmentField, valueField], sourceAs: sourceField, labels } });
  }

  if (detailSpec['aggregate'] !== false) {
    transform.push({
      aggregate: {
        groupby,
        fields: [{ op: (detailSpec['op'] as string) || 'sum', field: valueField, as: valueField }]
      }
    });
  }

  const layout = (detailSpec['layout'] as string) || 'stacked';
  const color = explicitDetailColor(
    detailSpec['color'],
    (encoding['color'] as ChannelSpec | undefined),
    segmentField,
    segmentDomain
  );
  const newEncoding: Encoding = {
    ...cloneEncoding(spec.encoding) as Encoding,
    x: channelFromField(categoryField, (detailSpec['categoryTitle'] as string) || (encoding['x'] as ChannelSpec)?.title || null, 'nominal'),
    y: {
      ...channelFromField(valueField, (detailSpec['valueTitle'] as string) || (encoding['y'] as ChannelSpec)?.title || null, 'quantitative'),
      ...((encoding['y'] as ChannelSpec)?.format
        ? { format: (encoding['y'] as ChannelSpec).format }
        : {})
    },
    detail: { field: segmentField, type: 'nominal' },
    ...(color ? { color } : {})
  };

  if (layout === 'grouped') {
    (newEncoding as AnyRecord)['xOffset'] = { field: segmentField, type: 'nominal' };
  } else {
    delete (newEncoding as AnyRecord)['xOffset'];
    delete (newEncoding as AnyRecord)['yOffset'];
  }

  return withSceneState(withObject({
    ...spec,
    transform,
    encoding: newEncoding as ViewSpec['encoding']
  }, {
    key: (detailSpec['key'] as string | string[] | undefined) || [categoryField, segmentField],
    semantic: (detailSpec['semantic'] as SemanticKey | undefined) ||
      (detailSpec['semanticKey'] as SemanticKey | undefined) ||
      semanticKeyFromParts({ field: categoryField }, { field: sourceField })
  }), {
    detail: {
      layout,
      fields,
      segmentField,
      sourceField,
      segments: segmentDomain.length ? segmentDomain : null,
      valueField
    }
  });
}

function explicitDetailColor(
  requested: unknown,
  inherited: ChannelSpec | undefined,
  segmentField: string,
  segmentDomain: string[]
): ChannelSpec | undefined {
  if (requested === false) return undefined;
  if (Array.isArray(requested)) {
    return {
      field: segmentField,
      type: 'nominal',
      ...(segmentDomain.length ? { domain: segmentDomain } : {}),
      range: requested as string[]
    };
  }
  if (requested && typeof requested === 'object') {
    const channel = requested as ChannelSpec;
    return {
      ...(!channel.field && !channel.value && !channel.hue && !channel.luminance
        ? { field: segmentField, type: 'nominal' as const }
        : {}),
      ...channel
    };
  }
  return inherited;
}

function withDefaultBarSemanticKey(spec: ViewSpec): ViewSpec {
  if (specSemanticKey(spec)) return spec;
  const semanticKey = semanticKeyFromEncoding(spec.encoding as Encoding || {});
  return semanticKey ? withObject(spec, { semantic: semanticKey }) : spec;
}

function encodingWithBarLayout(
  encoding: Encoding = {},
  layout: string | null = 'stacked',
  segmentField: string | null = null,
  orientation = barOrientationFromEncoding(encoding)
): Encoding {
  const next = cloneEncoding(encoding) as Encoding;
  if (layout === 'grouped' && segmentField) {
    delete (next as AnyRecord)['xOffset'];
    delete (next as AnyRecord)['yOffset'];
    (next as AnyRecord)[barOffsetChannelName(orientation)] = { field: segmentField, type: 'nominal' };
    return next;
  }
  delete (next as AnyRecord)['xOffset'];
  delete (next as AnyRecord)['yOffset'];
  return next;
}

function semanticKeyFromEncoding(encoding: Encoding, previousSemanticKey: SemanticKey | null = null): SemanticKey | null {
  const cat = categoryChannel(encoding);
  const meas = measureChannel(encoding);
  if (!cat?.field || !meas?.field) return previousSemanticKey;
  return semanticKeyFromParts(
    previousSemanticKey?.entity || previousSemanticKey?.entities || { field: cat.field },
    { value: meas.field }
  );
}

function semanticKeyFromParts(entity: SemanticKey['entity'], measure: SemanticKeyPart): SemanticKey {
  return { entity, measure };
}

function categoryChannel(encoding: Encoding = {}): ChannelSpec | null {
  if (['nominal', 'ordinal'].includes((encoding['x'] as ChannelSpec)?.type || '')) return encoding['x'] as ChannelSpec;
  if (['nominal', 'ordinal'].includes((encoding['y'] as ChannelSpec)?.type || '')) return encoding['y'] as ChannelSpec;
  return (encoding['x'] as ChannelSpec)?.field ? (encoding['x'] as ChannelSpec) : (encoding['y'] as ChannelSpec) || null;
}

function measureChannel(encoding: Encoding = {}): ChannelSpec | null {
  if ((encoding['y'] as ChannelSpec)?.type === 'quantitative') return encoding['y'] as ChannelSpec;
  if ((encoding['x'] as ChannelSpec)?.type === 'quantitative') return encoding['x'] as ChannelSpec;
  return (encoding['y'] as ChannelSpec)?.field ? (encoding['y'] as ChannelSpec) : (encoding['x'] as ChannelSpec) || null;
}

function oppositeOrientation(orientation: BarOrientation): BarOrientation {
  return orientation === 'horizontal' ? 'vertical' : 'horizontal';
}
