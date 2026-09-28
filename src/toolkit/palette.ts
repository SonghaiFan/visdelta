function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Extract hue angle (0–360°) from a CSS color string.
// Supports #rrggbb, #rgb, and rgb(r,g,b).
// Returns null for near-achromatic colors (saturation range < 10 %).
function parseColorHue(color: string): number | null {
  if (typeof color !== 'string') return null;
  let r, g, b;
  const hex = color.trim().match(/^#([0-9a-f]{3,6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex;
    r = parseInt(full.slice(0, 2), 16) / 255;
    g = parseInt(full.slice(2, 4), 16) / 255;
    b = parseInt(full.slice(4, 6), 16) / 255;
  } else {
    const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (!m) return null;
    r = Number(m[1]) / 255;
    g = Number(m[2]) / 255;
    b = Number(m[3]) / 255;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.1) return null; // near-achromatic — skip in hue selection
  let h;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return (h * 60 + 360) % 360;
}

// Greedy farthest-first selection: choose n colors from `colors` such that the
// minimum pairwise hue distance among the chosen set is maximised.
// Near-achromatic entries are relegated to the end (appended only when needed).
// Works on any resolved-color array, so user-customised palettes benefit too.
export function pickCategoricalColors(n: number, colors: string[]): string[] {
  if (n <= 0) return [];
  if (n >= colors.length) {
    return Array.from({ length: n }, (_, i) => colors[i % colors.length]);
  }
  const hues = colors.map(parseColorHue);
  const chromatic  = hues.map((h, i) => h !== null ? i : -1).filter((i) => i >= 0);
  const achromatic = hues.map((h, i) => h === null ? i : -1).filter((i) => i >= 0);

  if (chromatic.length === 0) return colors.slice(0, n); // all near-gray

  const chosen    = [chromatic[0]];
  const remaining = chromatic.slice(1);

  while (chosen.length < n) {
    if (remaining.length > 0) {
      let bestK = 0, bestMinDist = -Infinity;
      for (let k = 0; k < remaining.length; k++) {
        const i = remaining[k];
        const minDist = Math.min(...chosen.map((j) => hueDist(hues[i]!, hues[j]!)));
        if (minDist > bestMinDist) { bestMinDist = minDist; bestK = k; }
      }
      chosen.push(remaining.splice(bestK, 1)[0]);
    } else {
      // Chromatic pool exhausted — fill with achromatic entries
      const take = Math.min(achromatic.length, n - chosen.length);
      chosen.push(...achromatic.splice(0, take));
    }
  }
  return chosen.slice(0, n).map((i) => colors[i]);
}
