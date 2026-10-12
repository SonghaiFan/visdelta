'use client';
/**
 * Browser helpers shared by the playground, gallery and homepage. They run the
 * reader's (or the corpus's) VisDelta code against the real library build.
 */
import type { VisualizationTransition } from 'visdelta/transition';
import { basePath } from '@/lib/shared';

export type ChartName = 'bar' | 'line' | 'area' | 'point' | 'unit' | 'pie';
type Factory = (data?: unknown) => ChartState;

/** The subset of a builder state these helpers rely on. */
export interface ChartState {
  toSpec(): Record<string, unknown> & { mark?: string; data?: unknown; encoding?: Record<string, unknown> };
  rows(source?: unknown[]): Record<string, unknown>[];
  chartModule(): { key: string };
}

export type Rows = Record<string, unknown>[];
type D3 = typeof import('d3');

const factoryLoaders: Record<ChartName, () => Promise<Factory>> = {
  bar: () => import('visdelta/bar').then((m) => m.bar as unknown as Factory),
  line: () => import('visdelta/line').then((m) => m.line as unknown as Factory),
  area: () => import('visdelta/area').then((m) => m.area as unknown as Factory),
  point: () => import('visdelta/point').then((m) => m.point as unknown as Factory),
  unit: () => import('visdelta/unit').then((m) => m.unit as unknown as Factory),
  pie: () => import('visdelta/pie').then((m) => m.pie as unknown as Factory),
};

export function loadFactory(name: ChartName) {
  return factoryLoaders[name]();
}

export async function loadFactories(names: ChartName[]) {
  const entries = await Promise.all(names.map(async (name) => [name, await loadFactory(name)] as const));
  return Object.fromEntries(entries) as Record<ChartName, Factory>;
}

let d3Promise: Promise<D3> | null = null;
/** Full D3, available to evaluated code as `d3` (as on the original site). */
export function loadD3() {
  d3Promise ??= import('d3');
  return d3Promise;
}

export function loadRuntime() {
  return import('visdelta/transition');
}

/** Corpus data paths are written as "./data/x.csv"; serve them under the base path. */
export function dataHref(url: string) {
  return url.replace(/^\.\//, `${basePath}/`);
}

const csvCache = new Map<string, Promise<Rows>>();
export async function loadCsv(url: string): Promise<Rows> {
  const href = dataHref(url);
  if (!csvCache.has(href)) {
    csvCache.set(href, loadD3().then((d3) => d3.csv(href, d3.autoType) as Promise<Rows>));
  }
  return structuredClone(await csvCache.get(href)!);
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;

/**
 * Run VisDelta authoring code that assigns `const chart = …`. The code sees the
 * chart factories by name, `d3`, and `rows`. It runs in this page with the
 * reader's own permissions, exactly like code typed into the browser console.
 */
export async function evaluateChart(
  source: string,
  factories: Partial<Record<ChartName, Factory>>,
  rows: Rows,
  { withD3 = true }: { withD3?: boolean } = {},
): Promise<ChartState> {
  // Full D3 is only fetched for code that may use it (playground, gallery).
  const d3 = withD3 ? await loadD3() : undefined;
  const names = Object.keys(factories);
  const run = new AsyncFunction(...names, 'd3', 'rows', `"use strict";\n${source}\nreturn chart;`);
  const state = (await run(...names.map((name) => factories[name as ChartName]), d3, structuredClone(rows))) as ChartState;
  if (typeof state?.toSpec !== 'function' || typeof state?.rows !== 'function') {
    throw new Error('Assign a VisDelta state to `const chart`.');
  }
  return state;
}

/** Detach a state from URL data by freezing its resolved rows into the spec. */
export async function freezeState(state: ChartState): Promise<{ state: ChartState; data: Rows }> {
  const spec = state.toSpec();
  const source = spec.data as { values?: Rows; url?: string } | Rows | undefined;
  let data: Rows | undefined = Array.isArray(source) ? source : source?.values;
  if (!data && source && !Array.isArray(source) && source.url) {
    const d3 = await loadD3();
    const href = dataHref(source.url);
    data = (/\.json(?:[?#]|$)/i.test(href) ? await d3.json(href) : await d3.csv(href, d3.autoType)) as Rows;
  }
  const frozen = structuredClone(spec);
  frozen.data = { values: structuredClone(data ?? []) };
  return {
    state: { toSpec: () => structuredClone(frozen), rows: (s?: unknown[]) => state.rows(s), chartModule: () => state.chartModule() },
    data: data ?? [],
  };
}

/**
 * Render a state once into `target` and keep only a static clone of the
 * result. Galleries use this so dozens of thumbnails cost no live controllers.
 */
/** Resolve after the browser has had a chance to paint and handle input. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * `height` is the canvas height. With `fit` it is instead the height of the whole
 * figure: a heading and a top legend sit outside the canvas, so a fixed card must
 * give the canvas what they leave or the chart's bottom is clipped.
 */
export async function renderFrozen(state: ChartState, target: HTMLElement, height: number, { fit = false } = {}) {
  const { transition } = await loadRuntime();
  const host = document.createElement('div');
  host.className = 'vd-frozen-render';
  if (fit) host.style.height = `${height}px`;
  target.append(host);
  let controller: VisualizationTransition | null = null;
  try {
    // A same-state pair already drew its only frame when it was created.
    controller = await transition(state as never, state as never, { target: host, ...(fit ? { width: 'auto', height: 'auto' } : { height }) } as never);
    const nodes = [...host.childNodes].map((node) => node.cloneNode(true));
    return nodes;
  } finally {
    controller?.destroy();
    host.remove();
  }
}

/** A self-contained SVG image of a rendered chart, with computed colours inlined. */
export function svgSnapshot(host: Element): string | null {
  const svg = host.querySelector('svg');
  if (!svg) return null;
  const figure = host.querySelector('.vd-chart-figure');
  const header = figure?.querySelector<HTMLElement>('.vd-figure-header:not([hidden])');
  const legend = figure?.querySelector('.vd-legend-svg');
  if (figure && (header || legend)) return figureSnapshot(figure, header ?? null);
  return snapshotUrl(cloneSvg(svg));
}

const snapshotUrl = (svg: SVGSVGElement) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;

function cloneSvg(svg: SVGSVGElement): SVGSVGElement {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll('*')];
  const copies = [copy, ...copy.querySelectorAll('*')];
  copies.forEach((node) => {
    // Identity attributes can hold control characters that are invalid XML.
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith('data-')) node.removeAttribute(attribute.name);
    }
  });
  originals.forEach((node, index) => {
    const style = getComputedStyle(node);
    for (const property of ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family']) {
      (copies[index] as SVGElement).style.setProperty(property, style.getPropertyValue(property));
    }
  });
  return copy;
}

/** Compose the real figure blocks; the first SVG alone is now only the canvas. */
function figureSnapshot(figure: Element, header: HTMLElement | null): string {
  const namespace = 'http://www.w3.org/2000/svg';
  const bounds = figure.getBoundingClientRect();
  const result = document.createElementNS(namespace, 'svg');
  result.setAttribute('width', String(bounds.width));
  result.setAttribute('height', String(bounds.height));
  result.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  for (const svg of figure.querySelectorAll<SVGSVGElement>('.vd-view > svg')) {
    const rect = svg.getBoundingClientRect();
    const copy = cloneSvg(svg);
    copy.setAttribute('x', String(rect.left - bounds.left));
    copy.setAttribute('y', String(rect.top - bounds.top));
    copy.setAttribute('width', String(rect.width));
    copy.setAttribute('height', String(rect.height));
    result.append(copy);
  }
  if (header) {
    const rect = header.getBoundingClientRect();
    const block = document.createElementNS(namespace, 'foreignObject');
    block.setAttribute('x', String(rect.left - bounds.left));
    block.setAttribute('y', String(rect.top - bounds.top));
    block.setAttribute('width', String(rect.width));
    block.setAttribute('height', String(rect.height));
    const copy = header.cloneNode(true) as HTMLElement;
    const originals = [header, ...header.querySelectorAll<HTMLElement>('*')];
    const copies = [copy, ...copy.querySelectorAll<HTMLElement>('*')];
    originals.forEach((node, index) => {
      const style = getComputedStyle(node);
      for (const property of style) {
        if (!property.startsWith('--')) copies[index].style.setProperty(property, style.getPropertyValue(property));
      }
    });
    block.append(copy);
    result.append(block);
  }
  return snapshotUrl(result);
}

export function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
