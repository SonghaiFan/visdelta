import { cloneState } from './view-state.js';
import { serializeViewSpec } from '../spec-meta.js';
import type { ViewSpec } from '../types/index.js';

export type DeclarationValue = { present: false } | { present: true; value: unknown };

/** Exact edits of serialized declarations, independent of semantic categories. */
export interface DeclarationEdit {
  path: string[];
  previous: DeclarationValue;
  next: DeclarationValue;
}

export function declarationEdits(from: ViewSpec, to: ViewSpec): DeclarationEdit[] {
  const edits: DeclarationEdit[] = [];
  visit(serializeViewSpec(from), serializeViewSpec(to), []);
  return edits;

  function visit(a: Record<string, unknown>, b: Record<string, unknown>, prefix: string[]): void {
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const previous = entry(a, key);
      const next = entry(b, key);
      if (equal(previous, next)) continue;
      const path = [...prefix, key];
      // Arrays (especially transform pipelines) are indivisible ordered values.
      if (previous.present && next.present && record(previous.value) && record(next.value)) {
        visit(previous.value, next.value, path);
      } else edits.push({ path, previous: cloneState(previous), next: cloneState(next) });
    }
  }
}

/** Apply only to the state the edits describe; a stale edit fails before mutation. */
export function applyDeclarationEdits(spec: ViewSpec, edits: readonly DeclarationEdit[]): ViewSpec {
  const result = serializeViewSpec(spec);
  for (const edit of edits) {
    if (!edit.path.length || edit.path.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) {
      throw new Error('Invalid declaration edit path');
    }
    let parent: Record<string, unknown> = result;
    for (const key of edit.path.slice(0, -1)) {
      if (!Object.prototype.hasOwnProperty.call(parent, key) || !record(parent[key])) {
        throw new Error(`Missing declaration parent: ${edit.path.join('.')}`);
      }
      parent = parent[key] as Record<string, unknown>;
    }
    const key = edit.path[edit.path.length - 1];
    if (!equal(entry(parent, key), edit.previous)) {
      throw new Error(`Stale declaration edit: ${edit.path.join('.')}`);
    }
    if (edit.next.present) parent[key] = cloneState(edit.next.value);
    else delete parent[key];
  }
  return result;
}

function entry(object: Record<string, unknown>, key: string): DeclarationValue {
  return Object.prototype.hasOwnProperty.call(object, key) ? { present: true, value: object[key] } : { present: false };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]));
}
