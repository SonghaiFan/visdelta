/** Shared HTML tooltip presentation, independent of chart and SVG scale. */
export interface TooltipPosition {
  clientX: number;
  clientY: number;
}

export function showTooltip(tooltip: HTMLElement, position: TooltipPosition, html: string): void {
  tooltip.innerHTML = html;
  tooltip.style.opacity = '1';
  moveTooltip(tooltip, position);
}

export function moveTooltip(tooltip: HTMLElement, position: TooltipPosition): void {
  const gap = 14;
  const bounds = tooltip.getBoundingClientRect();
  const view = tooltip.ownerDocument.defaultView;
  const width = view?.innerWidth ?? Infinity;
  const height = view?.innerHeight ?? Infinity;
  const x = position.clientX + gap + bounds.width <= width - 4
    ? position.clientX + gap : position.clientX - gap - bounds.width;
  const y = position.clientY + gap + bounds.height <= height - 4
    ? position.clientY + gap : position.clientY - gap - bounds.height;
  tooltip.style.left = `${Math.max(4, x)}px`;
  tooltip.style.top = `${Math.max(4, y)}px`;
}

export function hideTooltip(tooltip: HTMLElement): void { tooltip.style.opacity = '0'; }

/** Chart modules supply an anchor in their own SVG coordinate system. */
export function svgTooltipPosition(frame: SVGGraphicsElement, x: number, y: number): TooltipPosition | null {
  const matrix = frame.getScreenCTM();
  if (!matrix) return null;
  const point = new DOMPoint(x, y).matrixTransform(matrix);
  return { clientX: point.x, clientY: point.y };
}
