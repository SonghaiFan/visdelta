/**
 * One canvas dimension: a fixed number of CSS pixels, or "auto" to follow the
 * container the chart is mounted in.
 */
export type CanvasSize = number | 'auto';

/** Throw unless `value` is absent, "auto", or a finite positive number. */
export function assertCanvasSize(label: string, value: unknown): asserts value is CanvasSize | undefined {
  if (value === undefined || value === 'auto') return;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return;
  throw new Error(`${label} must be a finite positive number of pixels, or "auto".`);
}

/** The height available to content inside `element`: its box without padding. */
export function contentHeight(element: Element): number {
  const style = getComputedStyle(element);
  return element.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
}
