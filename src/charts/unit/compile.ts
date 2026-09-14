import type { SpecCompiler, ViewSpec } from '../../types/index.js';
import {
  cloneEncoding,
  compileFilter,
  compileFocus,
  compileHighlight,
  copyDefined,
  identitySpec,
  resolveAxisOrder,
  withObject,
  withSceneState
} from '../compiler-utils.js';
import { specObjectKey, specUnit, withSpecMeta } from '../../spec-meta.js';

type AnyRecord = Record<string, unknown>;

export function createUnitSpecCompiler(_context: AnyRecord = {}): SpecCompiler {
  return {
    base: compileUnitBase,
    operations: {
      filter: compileFilter,
      focus: compileFocus,
      highlight: compileHighlight,
      layout: compileUnitLayout,
      unitLayout: compileUnitLayout,
      encode: compileUnitEncoding
    }
  };
}

function compileUnitBase(spec: ViewSpec, _context: AnyRecord = {}): ViewSpec {
  return identitySpec(spec);
}

function compileUnitLayout(spec: ViewSpec, axisSpec: AnyRecord = {}, _context: AnyRecord = {}): ViewSpec {
  const unit = {
    ...(specUnit(spec) || {}),
    ...copyDefined(axisSpec, [
      'layout', 'columns', 'radius', 'x', 'y',
      'group', 'value', 'unitValue', 'maxUnits'
    ])
  };
  const encoding = cloneEncoding(spec.encoding);
  if (axisSpec['color']) (encoding as AnyRecord)['color'] = axisSpec['color'];

  return withSceneState(withObject(withSpecMeta({ ...spec, encoding: encoding as ViewSpec['encoding'] }, { unit }), {
    key: (axisSpec['key'] as string) || specObjectKey(spec) as string
  }), {
    axis: {
      layout: (unit['layout'] as string) || 'grid',
      x: unit['x'] || null,
      y: unit['y'] || null,
      group: unit['group'] || null,
      value: unit['value'] || null,
      ...resolveAxisOrder(axisSpec, 'unit')
    }
  });
}

function compileUnitEncoding(spec: ViewSpec, operationSpec: AnyRecord = {}, context: AnyRecord = {}): ViewSpec {
  return compileUnitLayout(spec, operationSpec, context);
}
