import type { RenderContext } from './render-types.js';
export type ThemeValue = ReturnType<typeof createThemeValue>;
/** Read CSS tokens from the host's current scoped root at render time. */
export function createThemeValue(context: Pick<RenderContext, 'root'> = {}) {
  function themeValue(cssVar: string, fallback: number): number;
  function themeValue(cssVar: string, fallback: string): string;
  function themeValue(cssVar: string, fallback: string | number): string | number {
    if (typeof document === 'undefined') return fallback;
    const contextRoot = context.root ?? document.documentElement;
    const scopedRoot = contextRoot.matches?.('.vd-transition-root, .vd-chart-root')
      ? contextRoot
      : contextRoot.querySelector?.('.vd-transition-root, .vd-chart-root');
    const style = getComputedStyle(scopedRoot ?? contextRoot);
    const raw = style.getPropertyValue(cssVar).trim();
    if (!raw) return fallback;
    // Defensive var() resolution: if the browser returns an unresolved
    // var() reference (e.g. "var(--vd-rounded-md)"), resolve one level.
    // Modern browsers should already compute the final value, but this
    // guards against edge-cases and non-browser environments.
    if (raw.startsWith('var(')) {
      const m = raw.match(/^var\(\s*(--[\w-]+)(?:\s*,\s*([^)]*?))?\s*\)$/);
      if (m) {
        const resolved = style.getPropertyValue(m[1]).trim() || m[2]?.trim() || '';
        if (!resolved) return fallback;
        if (typeof fallback === 'number') {
          const n = parseFloat(resolved);
          return isNaN(n) ? fallback : n;
        }
        return resolved;
      }
      return fallback;
    }
    if (typeof fallback === 'number') {
      const n = parseFloat(raw);
      return isNaN(n) ? fallback : n;
    }
    return raw;
  }

  return themeValue;
}
