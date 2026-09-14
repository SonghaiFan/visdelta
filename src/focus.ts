import { matchesFilter, normalizeFilter } from './data/filter.js';
import { specState } from './spec-meta.js';
import type { DataRow, SelectionSpec, ViewSpec } from './types/index.js';

type AnyRecord = Record<string, unknown>;

export interface FocusBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FocusTarget {
  datum: DataRow;
  bounds: FocusBounds;
}

export interface FocusViewport {
  width: number;
  height: number;
}

export interface FocusCamera {
  k: number;
  x: number;
  y: number;
  bounds: FocusBounds | null;
}

const IDENTITY_CAMERA: FocusCamera = Object.freeze({ k: 1, x: 0, y: 0, bounds: null });

export function viewSelection(spec: ViewSpec): SelectionSpec | null {
  const state = specState(spec);
  return (state.scopes.focus ||
    (state.sceneState?.selection?.mode === 'focus' ? state.sceneState.selection : null) ||
    (state.selection?.mode === 'focus' ? state.selection : null)) as SelectionSpec | null;
}

/** Resolve the independent highlight scope, retaining legacy selection specs. */
export function viewHighlight(spec: ViewSpec): SelectionSpec | null {
  const state = specState(spec);
  return (state.scopes.highlight ||
    (state.sceneState?.selection?.mode === 'highlight' ? state.sceneState.selection : null) ||
    (state.selection?.mode === 'highlight' ? state.selection : null)) as SelectionSpec | null;
}

/** All selectors in a scope compose as logical AND. */
export function matchesSelection(row: DataRow, selection: SelectionSpec | null | undefined): boolean {
  const filters = selection?.filters ?? (selection?.filter ? [selection.filter] : []);
  return filters.length > 0 && filters.every((filter) => matchesFilter(row, normalizeFilter(filter)));
}

/**
 * Fit one two-dimensional camera around selected visual geometry. The selector
 * chooses camera targets only: it never changes data membership or mark keys.
 */
export function focusCamera(
  targets: FocusTarget[],
  selection: SelectionSpec | null | undefined,
  viewport: FocusViewport
): FocusCamera {
  if (selection?.mode !== 'focus' || !(selection.filters?.length || selection.filter)) return { ...IDENTITY_CAMERA };

  const selected = targets.filter((target) => matchesSelection(target.datum, selection));
  const bounds = unionBounds(selected.map((target) => target.bounds));
  if (!bounds) return { ...IDENTITY_CAMERA };

  return fitCamera(bounds, viewport);
}

/** Compute an aspect-preserving zoom and pan that centers bounds in a viewport. */
export function fitCamera(
  bounds: FocusBounds,
  viewport: FocusViewport
): FocusCamera {
  const width = positive(viewport.width);
  const height = positive(viewport.height);
  const safe = normalizeBounds(bounds);
  if (!width || !height || !safe) return { ...IDENTITY_CAMERA };

  const boundsWidth = Math.max(1e-6, safe.x1 - safe.x0);
  const boundsHeight = Math.max(1e-6, safe.y1 - safe.y0);
  // Focus never zooms farther out than the complete chart. When all marks are
  // selected, identity is the most honest camera.
  const k = Math.max(1, Math.min(width / boundsWidth, height / boundsHeight));
  const centerX = (safe.x0 + safe.x1) / 2;
  const centerY = (safe.y0 + safe.y1) / 2;

  const x = width / 2 - k * centerX;
  const y = height / 2 - k * centerY;
  return { k, x, y, bounds: safe };
}

/**
 * Apply a camera to a positional scale while retaining the scale's full data
 * domain. The continuous-scale path mirrors d3-zoom's Transform rescale math;
 * the band path supplies the range adapter that d3-zoom cannot provide because
 * band scales have no invert method.
 */
export function cameraScale(scale: AnyRecord, camera: FocusCamera, axis: 'x' | 'y'): AnyRecord {
  if (!scale || camera.k === 1 && camera.x === 0 && camera.y === 0) return scale;
  const copy = (scale.copy as (() => AnyRecord) | undefined)?.call(scale);
  const range = (scale.range as (() => number[]) | undefined)?.call(scale);
  if (!copy || !Array.isArray(range) || range.length < 2) return scale;

  const invert = scale.invert as ((value: number) => unknown) | undefined;
  if (typeof invert === 'function') {
    const domain = range.map((pixel) => invert.call(scale, cameraInvert(pixel, camera, axis)));
    (copy.domain as (domain: unknown[]) => AnyRecord)(domain);
  } else {
    (copy.range as (range: number[]) => AnyRecord)(
      range.map((pixel) => cameraPosition(pixel, camera, axis))
    );
  }
  copy.__visDeltaChannel = scale.__visDeltaChannel;
  return copy;
}

export function cameraSize(value: number, camera: FocusCamera): number {
  return Number(value) * camera.k;
}

export function cameraPosition(value: number, camera: FocusCamera, axis: 'x' | 'y'): number {
  return Number(value) * camera.k + (axis === 'x' ? camera.x : camera.y);
}

export function rectBounds(x: number, y: number, width: number, height: number): FocusBounds {
  return normalizeBounds({ x0: x, y0: y, x1: x + width, y1: y + height }) || {
    x0: 0, y0: 0, x1: 0, y1: 0
  };
}

export function pointBounds(x: number, y: number, radius: number): FocusBounds {
  const r = Math.max(0.5, Number(radius) || 0);
  return { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
}

function unionBounds(bounds: FocusBounds[]): FocusBounds | null {
  const valid = bounds.map(normalizeBounds).filter((value): value is FocusBounds => Boolean(value));
  if (!valid.length) return null;
  return {
    x0: Math.min(...valid.map((value) => value.x0)),
    y0: Math.min(...valid.map((value) => value.y0)),
    x1: Math.max(...valid.map((value) => value.x1)),
    y1: Math.max(...valid.map((value) => value.y1))
  };
}

function normalizeBounds(bounds: FocusBounds): FocusBounds | null {
  const values = [bounds.x0, bounds.y0, bounds.x1, bounds.y1].map(Number);
  if (!values.every(Number.isFinite)) return null;
  return {
    x0: Math.min(values[0], values[2]),
    y0: Math.min(values[1], values[3]),
    x1: Math.max(values[0], values[2]),
    y1: Math.max(values[1], values[3])
  };
}

function positive(value: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function cameraInvert(value: number, camera: FocusCamera, axis: 'x' | 'y'): number {
  return (Number(value) - (axis === 'x' ? camera.x : camera.y)) / camera.k;
}
