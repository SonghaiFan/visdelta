import type { ChannelSpec, SpecCompiler, ViewSpec } from '../../types/index.js';
import { specObjectKey } from '../../spec-meta.js';
import { titleize } from '../../labels.js';
import { colorField } from './encoding.js';
import {
  aggregateFieldSpec,
  compileCartesianCoordinate,
  compileCartesianScale,
  compileFilter,
  compileFocus,
  compileHighlight,
  identitySpec,
  mergeXYChannel,
  withObject,
  withSceneState
} from '../compiler-utils.js';

type AnyRecord = Record<string, unknown>;

export function createPointSpecCompiler(_context: AnyRecord = {}): SpecCompiler {
  return {
    base: compilePointBase,
    operations: {
      filter: compileFilter,
      focus: compileFocus,
      highlight: compileHighlight,
      coordinate: compilePointCoordinate,
      scale: compilePointScale,
      aggregate: compilePointAggregate,
      layout: compilePointLayout
    }
  };
}

function compilePointBase(spec: ViewSpec, _context: AnyRecord = {}): ViewSpec {
  return identitySpec(spec);
}

function compilePointCoordinate(spec: ViewSpec, operationSpec: AnyRecord = {}, _context: AnyRecord = {}): ViewSpec {
  return compileCartesianCoordinate(spec, operationSpec);
}

function compilePointScale(spec: ViewSpec, operationSpec: AnyRecord = {}, _context: AnyRecord = {}): ViewSpec {
  return compileCartesianScale(spec, operationSpec);
}

function compilePointAggregate(spec: ViewSpec, detailSpec: AnyRecord = {}, _context: AnyRecord = {}): ViewSpec {
  const mode = (detailSpec['mode'] as string) || 'detail';
  const authoredGroupby = normalizeFields(detailSpec['groupby']);
  const parentField =
    (detailSpec['parentField'] as string) ||
    parentFromGroupby(authoredGroupby) ||
    colorField(spec.encoding as Record<string, ChannelSpec>);
  const detail =
    (detailSpec['detail'] as string) ||
    specObjectKey(spec) as string ||
    (spec.encoding?.['key'] as ChannelSpec)?.field ||
    (spec.encoding?.['x'] as ChannelSpec)?.field;

  if (mode === 'aggregate') {
    const groupby = authoredGroupby.length ? authoredGroupby : [parentField].filter(Boolean) as string[];
    const x = mergeXYChannel(spec.encoding?.['x'] as ChannelSpec, (detailSpec['x'] as ChannelSpec) || spec.encoding?.['x'] as ChannelSpec, 'quantitative');
    const y = mergeXYChannel(spec.encoding?.['y'] as ChannelSpec, (detailSpec['y'] as ChannelSpec) || spec.encoding?.['y'] as ChannelSpec, 'quantitative');
    const xAs = (detailSpec['x'] as ChannelSpec & { as?: string })?.as || x.field!;
    const yAs = (detailSpec['y'] as ChannelSpec & { as?: string })?.as || y.field!;
    const xAggregate = aggregateFieldSpec(detailSpec['x'] as ChannelSpec, x.field!, xAs, 'mean');
    const yAggregate = aggregateFieldSpec(detailSpec['y'] as ChannelSpec, y.field!, yAs, 'mean');
    const size = compileAggregateSize(detailSpec['size']);
    const fields = [xAggregate, yAggregate, ...(size ? [size.aggregate] : [])];
    const { size: _oldSize, ...baseEncoding } = spec.encoding || {};

    return withSceneState(withObject({
      ...spec,
      transform: [...(spec.transform || []), { aggregate: { groupby, fields } }],
      encoding: {
        ...baseEncoding,
        x: { ...x, field: xAs, title: (detailSpec['x'] as ChannelSpec & { title?: string })?.title || aggregateTitle(xAggregate.op, x.title || x.field!) },
        y: { ...y, field: yAs, title: (detailSpec['y'] as ChannelSpec & { title?: string })?.title || aggregateTitle(yAggregate.op, y.title || y.field!) },
        ...(size ? { size: size.channel } : {})
      }
    }, { key: (detailSpec['key'] as string | string[] | undefined) || groupby }), {
      detail: { mode, groupby, ...(size ? { size: size.aggregate } : {}) }
    });
  }

  return withSceneState(withObject({ ...spec }, {
    key: (detailSpec['key'] as string) || detail as string
  }), {
    detail: {
      mode: 'detail',
      detail,
      ...(parentField ? { parentField } : {})
    }
  });
}

function compileAggregateSize(value: unknown): {
  aggregate: { op: string; field?: string; as: string };
  channel: ChannelSpec;
} | null {
  if (!value || value === false) return null;
  const size = (value === true ? {} : value) as ChannelSpec & { op?: string; as?: string };
  const op = size.op || 'count';
  const field = size.field;
  if (op !== 'count' && !field) {
    throw new Error('Point rollup size needs a field unless op is "count".');
  }
  const as = size.as || (op === 'count' ? 'count' : `${op}_${field}`);
  const { op: _op, as: _as, field: _field, ...visual } = size;
  return {
    aggregate: { op, ...(field ? { field } : {}), as },
    channel: { ...visual, field: as, type: 'quantitative' }
  };
}

function compilePointLayout(spec: ViewSpec, _operationSpec: AnyRecord = {}, _context: AnyRecord = {}): ViewSpec {
  return spec;
}

function aggregateTitle(op: string, title: string): string {
  if (!op || op === 'sum' || new RegExp(`^${op}\\s`, 'i').test(title)) return titleize(title);
  return `${titleize(op)} ${lowerFirst(titleize(title))}`;
}

function lowerFirst(value: string): string {
  return String(value || '').replace(/^\w/, (letter) => letter.toLowerCase());
}

function normalizeFields(value: unknown): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean) as string[];
}

function parentFromGroupby(groupby: string[]): string | string[] | null {
  if (!groupby.length) return null;
  return groupby.length === 1 ? groupby[0] : groupby;
}
