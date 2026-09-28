import type { RenderContext } from './render-types.js';
import type { ThemeValue } from './theme.js';

/** Read the current host font once per layout; never scale SVG type to fit. */
export function createTextMeasure(context: RenderContext, themeValue: ThemeValue, token = '--vd-legend-font-size') {
  const root = context.root?.matches('.vd-transition-root, .vd-chart-root') ? context.root
    : context.root?.querySelector('.vd-transition-root, .vd-chart-root') ?? context.root;
  const fontSize = themeValue(token, 10);
  const canvas = root?.ownerDocument.createElement('canvas').getContext('2d');
  if (!root || !canvas) return (text: string) => text.length * fontSize * 0.65;
  canvas.font = `${fontSize}px ${getComputedStyle(root).fontFamily}`;
  const widths = new Map<string, number>();
  return (text: string): number => {
    if (!widths.has(text)) widths.set(text, canvas.measureText(text).width);
    return widths.get(text)!;
  };
}
