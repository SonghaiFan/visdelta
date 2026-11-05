import { ChartState, selectorsFrom } from './authoring.js';
import { cloneState } from '../grammar/view-state.js';
import { deepEqual } from '../grammar/declaration-operations.js';
import { specScopes } from '../spec-meta.js';
import { chartError, editFailure } from '../edit-errors.js';
import type { FluentEdit } from '../fluent-edits.js';
import type { ChannelSpec, ViewSpec } from '../types/index.js';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Bounded color arguments shared by opt-in module adapters. */
export function editColor(args: unknown[], mark?: string): string | ChannelSpec {
  const bad = () => chartError('INVALID_EDIT_ARGUMENTS', 'color expects one string or explicit color channel.',
    'Use color({value: "red"}) or color({field: "product", type: "nominal", scheme: "Tableau10"}); submit a full state for other options.', { chartType: mark, method: 'color' });
  if (args.length !== 1) throw bad();
  const value = args[0];
  if (typeof value === 'string' && value.trim()) return value;
  if (!object(value)) throw bad();
  const keys = Object.keys(value);
  if (typeof value.value === 'string' && value.value.trim() && keys.length === 1) return value;
  if (typeof value.field !== 'string' || !value.field.trim() || !['nominal', 'ordinal', 'quantitative'].includes(String(value.type))
    || keys.some(key => !['field', 'type', 'scheme', 'range', 'domain'].includes(key))
    || (value.scheme !== undefined && (typeof value.scheme !== 'string' || !value.scheme.trim()))
    || (value.range !== undefined && (!Array.isArray(value.range) || !value.range.length || value.range.some(v => typeof v !== 'string' || !v.trim())))
    || (value.domain !== undefined && (!Array.isArray(value.domain) || value.domain.some(v => !['string', 'number'].includes(typeof v))))
    || (value.range !== undefined && (value.scheme !== undefined || value.type === 'quantitative'))) throw bad();
  return cloneState(value);
}

/** Validate the edit subset and preserve the exact selector location for recovery. */
export function editSelector(value: Record<string, unknown>) {
  const entries = value.field ? [['', value] as const] : Object.entries(value);
  for (const [field, constraint] of entries) {
    try {
      if (constraint === null) throw new Error('A null selector value does not clear attention.');
      selectorsFrom(field ? { [field]: constraint } : constraint as Record<string, unknown>);
    } catch (error) {
      const path = '/args/0' + (field ? '/' + field.replace(/~/g, '~0').replace(/\//g, '~1') : '');
      throw chartError('INVALID_EDIT_ARGUMENTS', error instanceof Error ? error.message : String(error),
        'Use a nonempty comparison selector. To clear attention, remove its scope in a complete declaration; empty filters and select-all are different states.', { path });
    }
  }
  return selectorsFrom(value);
}

/** Shared authored slots only. Each chart module explicitly opts in; rendering validates the final endpoint. */
export function editCommon<S extends ViewSpec>(source: S, calls: readonly FluentEdit[], resolved: S): S {
  const state = cloneState(source);
  const scopes = Object.fromEntries(Object.entries(specScopes(state)).filter(([, value]) => value != null));
  if (Object.keys(scopes).length) state.scopes = cloneState(scopes);
  // Do not re-run a chart compiler: the source already contains its derived slots.
  let builder = new ChartState(state);
  if (!deepEqual(builder.toSpec(), source)) throw chartError('UNSUPPORTED_EDIT_STATE',
    'This declaration cannot round-trip through common editing.', 'Submit a complete state with update().', { chartType: source.mark });
  for (const [editIndex, { method, args }] of calls.entries()) {
    try {
      const rows = builder.data(resolved.data).rows();
      const requireField = (field: string) => {
        // An empty result gives no evidence of available fields; retain ordinary runtime validation.
        if (rows.length && !rows.some(row => Object.prototype.hasOwnProperty.call(row, field))) throw chartError('MISSING_FIELD',
          `Field "${field}" is not available at this transform stage.`,
          'Use a field in the transformed rows, or move source-column filters before aggregation in a complete update.', { chartType: source.mark, method });
      };
      const bad = () => chartError('INVALID_EDIT_ARGUMENTS', `Invalid arguments for ${method}.`,
        'Use one nonempty selector object, sort(field, order?), or one explicit color channel.', { chartType: source.mark, method });
      switch (method) {
        case 'color': {
          const color = editColor(args, source.mark);
          const field = typeof color === 'string' ? (color.startsWith('#') ? undefined : color) : color.field;
          if (field) requireField(field);
          builder = builder.color(color); break;
        }
        case 'where': case 'highlight':
          if (args.length !== 1 || !object(args[0]) || !Object.keys(args[0]).length) throw bad();
          for (const filter of editSelector(args[0])) requireField(filter.field);
          builder = method === 'where' ? builder.where(args[0]) : builder.highlight(args[0]); break;
        case 'sort':
          if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0].trim()
            || (args[1] !== undefined && args[1] !== 'ascending' && args[1] !== 'descending')) throw bad();
          requireField(args[0]);
          builder = builder.sort(args[0], args[1] as 'ascending' | 'descending' | undefined); break;
        default: throw chartError('UNSUPPORTED_EDIT', `Chart module "${source.mark}" does not support edit ${method}.`,
          'Read capabilities().editMethods; use update() for a complete supported declaration.', { chartType: source.mark, method });
      }
    } catch (error) { throw editFailure(error, editIndex, method, source.mark); }
  }
  return builder.toSpec();
}
