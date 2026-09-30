import type { ChannelSpec, ChartContext, ChartSceneContext, ChartTransitionContext, DataRow } from '../types/index.js';
import type { ChartStyleModule } from '../charts/style.js';
import type { BaseType, Selection } from 'd3-selection';
import type { MotionTiming } from './recorder.js';
import type { DatumKey, LineageTable } from '../data/lineage.js';
export type SvgSelection<ElementType extends BaseType, Datum = unknown> =
  Selection<ElementType, Datum, BaseType, unknown>;
export type MotionTransition = MotionTiming;

export interface AxisElement extends SVGGElement {
  __visDeltaAxisActive?: boolean;
  __visDeltaAxisKind?: string;
}

export interface RuntimeScale {
  (value: unknown): number | undefined;
  domain(): unknown[];
  domain(values: Iterable<unknown>): RuntimeScale;
  range(): number[];
  range(values: Iterable<number>): RuntimeScale;
  bandwidth?: () => number;
  step?: () => number;
  ticks?: (count?: number) => unknown[];
  copy?: () => RuntimeScale;
  invert?: (value: number) => unknown;
  __visDeltaChannel?: RenderChannel;
  __visDeltaDataDomain?: unknown[];
}

export interface RenderChannel extends ChannelSpec {
  field?: string;
  value?: string;
  range?: string[];
  scheme?: string;
  scaleType?: string;
  hue?: RenderChannel;
  luminance?: RenderChannel;
  base?: string;
  lightness?: number[];
}

export interface RenderDatum extends DataRow {
  __row?: DataRow;
  __datumIdentity?: {
    fields: string[];
    mode: LineageTable['identity']['mode'];
    keys: DatumKey[];
  };
}

export type RenderScene = ChartSceneContext;
export type RenderTransition = ChartTransitionContext;
export type RenderChartContext = ChartContext;

export interface ScaleOptions {
  domainPadding?: number;
}

/** Distances from the chart's edges for an edge-placed axis title. */
export interface EdgeTitleInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AxisOptions {
  side?: 'top' | 'right' | 'bottom' | 'left';
  duration?: number;
  tickCount?: number;
  tickFormat?: string;
  position?: number;
  /**
   * Place the title at the chart edge (x: bottom-right, y: top-left) instead
   * of centered along the axis. The axis is the title's only writer either
   * way: a second placement on the same node would fight it frame by frame.
   */
  edgeTitleInset?: Readonly<EdgeTitleInset>;
}

export interface GridOptions {
  x?: RuntimeScale | null;
  keepX?: boolean;
  xTickCount?: number;
  yTickCount?: number;
  tickCount?: number;
  duration?: number;
}

export interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LegendLayoutItem {
  x: number;
  y: number;
}

export interface RenderContext {
  root?: Element;
  colors?: Map<string, Map<string, string>> | null;
  chartStyle?: ChartStyleModule;
}
