import type { SpecCompiler, ViewSpec } from '../../types/index.js';
import {
  aggregateFieldSpec,
  compileCartesianCoordinate,
  compileCartesianScale,
  compileFilter,
  compileFocus,
  compileHighlight,
  identitySpec,
  withObject,
  withSceneState
} from '../compiler-utils.js';

type AnyRecord = Record<string, unknown>;

export function createAreaSpecCompiler(_context: AnyRecord = {}): SpecCompiler {
  return {
    base: identitySpec,
    operations: {
      filter: compileFilter,
      focus: compileFocus,
      highlight: compileHighlight,
      coordinate: compileCartesianCoordinate,
      scale: compileCartesianScale,
      aggregate: compileAreaDetail,
      layout: compileAreaDetail
    }
  };
}

function compileAreaDetail(spec: ViewSpec, detailSpec: AnyRecord = {}): ViewSpec {
  const mode = String(detailSpec['mode'] ?? 'stacked');
  const encoding = { ...(spec.encoding || {}) } as Record<string, AnyRecord>;
  const seriesField = String(
    detailSpec['series'] ??
    (encoding['color']?.['field'] || '')
  ) || null;

  if (mode === 'stacked' && seriesField) {
    if (detailSpec['color']) {
      const requestedColor = detailSpec['color'] as AnyRecord;
      encoding['color'] = {
        ...(!requestedColor['field'] && !requestedColor['value']
          ? { field: seriesField, type: 'nominal' }
          : {}),
        ...requestedColor
      };
    }
    return withSceneState({ ...spec, encoding }, {
      detail: {
        mode,
        seriesField,
        layout: detailSpec['layout'] === 'stream' ? 'stream' : 'stacked',
        ...(detailSpec['layout'] === 'stream'
          ? {
              offset: detailSpec['offset'] === 'none' || detailSpec['offset'] === 'expand' ||
                detailSpec['offset'] === 'diverging' || detailSpec['offset'] === 'silhouette'
                ? detailSpec['offset']
                : 'wiggle',
              order: detailSpec['order'] === 'none' || detailSpec['order'] === 'reverse' ||
                detailSpec['order'] === 'appearance' || detailSpec['order'] === 'ascending' ||
                detailSpec['order'] === 'descending'
                ? detailSpec['order']
                : 'insideOut'
            }
          : {})
      }
    });
  }

  if (mode === 'single') {
    const x = encoding['x'];
    const y = encoding['y'];
    if (!x?.['field'] || !y?.['field']) return spec;
    const aggregate = aggregateFieldSpec(
      {
        field: String(y['field']),
        ...(detailSpec['op'] ? { op: String(detailSpec['op']) } : {}),
        ...(detailSpec['as'] ? { as: String(detailSpec['as']) } : {})
      } as import('../../types/index.js').ChannelSpec,
      String(y['field']),
      String(detailSpec['as'] ?? y['field']),
      'sum'
    );
    encoding['y'] = { ...y, field: aggregate.as };
    if (encoding['color']?.['field']) delete encoding['color'];
    if (detailSpec['color']) encoding['color'] = detailSpec['color'] as AnyRecord;
    return withSceneState(withObject({
      ...spec,
      transform: [...(spec.transform || []), {
        aggregate: { groupby: [String(x['field'])], fields: [aggregate] }
      }],
      encoding
    }, { key: String(x['field']) }), {
      detail: { mode, seriesField, op: aggregate.op }
    });
  }

  return spec;
}
