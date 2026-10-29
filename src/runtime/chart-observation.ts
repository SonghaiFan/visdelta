/** A read-only observation of currently rendered keyed marks, in CSS pixels. */
export interface ChartMarkObservation {
  id: string;
  key: string;
  tag: string;
  data: Record<string, unknown>;
  appearance: { fill: string; opacity: number };
  bounds: { x: number; y: number; width: number; height: number };
}
export interface ChartObservation {
  revision: number;
  width: number;
  height: number;
  marks: ChartMarkObservation[];
  orders: { leftToRight: string[]; topToBottom: string[] };
  notes: string[];
}
export interface ChartCapture {
  revision: number;
  mimeType: 'image/png';
  dataUrl: string;
  width: number;
  height: number;
}
export function observeChart(root: Element, revision: number): ChartObservation {
  const box = root.getBoundingClientRect();
  const marks: ChartMarkObservation[] = [];
  for (const [index, node] of Array.from(root.querySelectorAll<SVGElement>('.vd-mark-root [data-key]')).entries()) {
    const bounds = node.getBoundingClientRect();
    let visible = bounds.width > 0 && bounds.height > 0;
    for (let parent: Element | null = node; parent && root.contains(parent); parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) visible = false;
    }
    if (!visible) continue;
    const datum = (node as SVGElement & { __data__?: unknown }).__data__;
    const data: Record<string, unknown> = {};
    if (datum && typeof datum === 'object' && !Array.isArray(datum)) {
      for (const [key, value] of Object.entries(datum)) {
        if (!key.startsWith('_') && (value === null || ['string', 'number', 'boolean'].includes(typeof value))) data[key] = value;
      }
    }
    marks.push({ appearance: { fill: getComputedStyle(node).fill, opacity: Number(getComputedStyle(node).opacity) }, id: `r${revision}:mark${index}`, key: node.getAttribute('data-key')!, tag: node.tagName.toLowerCase(), data,
      bounds: { x: bounds.x - box.x, y: bounds.y - box.y, width: bounds.width, height: bounds.height } });
  }
  const order = (axis: 'x' | 'y') => [...marks].sort((a, b) => a.bounds[axis] - b.bounds[axis] || a.id.localeCompare(b.id)).map(mark => mark.id);
  return { revision, width: box.width, height: box.height, marks, orders: { leftToRight: order('x'), topToBottom: order('y') },
    notes: ['Only visible keyed mark elements are listed. Decorations and unkeyed custom-plugin geometry are excluded. Bounds are CSS pixels relative to the chart view. IDs are revision-scoped; re-inspect after edits or resize.'] };
}
export async function captureChart(root: Element, revision: number): Promise<ChartCapture> {
  const original = root.querySelector('svg');
  if (!original) throw new Error('The chart has no SVG canvas.');
  if (original.querySelector('image, foreignObject')) throw new Error('External images and foreignObject are not supported by chart capture.');
  const rect = original.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
  if (width * height > 16_000_000) throw new Error('Chart capture exceeds the 16 megapixel limit.');
  const clone = original.cloneNode(true) as SVGSVGElement;
  const source = [original, ...Array.from(original.querySelectorAll('*'))];
  const target = [clone, ...Array.from(clone.querySelectorAll('*'))];
  const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'display', 'visibility'];
  source.forEach((node, index) => { const style = getComputedStyle(node); for (const property of properties) (target[index] as SVGElement).style.setProperty(property, style.getPropertyValue(property)); });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas capture is unavailable.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(img, 0, 0);
    return { revision, mimeType: 'image/png', dataUrl: canvas.toDataURL('image/png'), width, height };
  } finally { URL.revokeObjectURL(url); }
}
