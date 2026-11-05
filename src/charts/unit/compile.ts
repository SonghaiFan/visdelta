import type { SpecCompiler, ViewSpec } from '../../types/index.js';
import { cloneEncoding, copyDefined, identitySpec, resolveAxisOrder, withObject, withSceneState } from '../../charts/compiler-utils.js';
import { specObjectKey, specUnit, withSpecMeta } from '../../spec-meta.js';

type AnyRecord = Record<string, unknown>;

export function createUnitSpecCompiler(_context: AnyRecord = {}): SpecCompiler {
  return {
    stateOrder: ["axis"],
    base: compileUnitBase,
    operations: {
      axis: compileUnitLayout
    }
  };
}

function compileUnitBase(spec: ViewSpec, _context: AnyRecord = {}): ViewSpec {
  if (Object.prototype.hasOwnProperty.call(specUnit(spec) ?? {}, 'radius')) throw new Error('Unit size belongs in encoding.size; use .size(number).');
  return identitySpec(spec);
}

function compileUnitLayout(spec: ViewSpec, axisSpec: AnyRecord = {}, _context: AnyRecord = {}): ViewSpec {
  const unit = {
    ...(specUnit(spec) || {}),
    ...copyDefined(axisSpec, [
      'layout', 'columns', 'x', 'y',
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
