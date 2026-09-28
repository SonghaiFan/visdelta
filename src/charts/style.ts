import type { ChannelSpec, MarginSpec } from '../types/index.js';

export type ChartGridStyle = 'none' | 'horizontal' | 'vertical' | 'both';
export type ChartLegendPosition = 'top' | 'right';

export interface ChartStyleRule {
  margin: Readonly<MarginSpec>;
  grid: ChartGridStyle;
  openXDomain: boolean;
  openYDomain: boolean;
  edgeTitles: boolean;
}

export interface ChartStyleModule {
  key: string;
  tickSpacing: Readonly<{ x: number; y: number }>;
  edgeTitleInset: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  legendInset: Readonly<{ top: number; left: number }>;
  legendPosition: ChartLegendPosition;
  plot: Readonly<ChartStyleRuleDefinition>;
  axisTitle(channel: ChannelSpec | undefined, direction: 'right' | 'up'): string | undefined;
}

export interface ChartStyleRuleDefinition extends Partial<Omit<ChartStyleRule, 'margin'>> {
  margin?: Partial<MarginSpec>;
}

/** Fully resolved presentation shared by one instantiated chart plugin. */
export interface ChartPresentation {
  readonly theme: ChartStyleModule;
  readonly plot: Readonly<ChartStyleRule>;
}

export interface ChartPresentationDefinition {
  plot?: ChartStyleRuleDefinition;
}

export interface ChartStyleDefinition {
  key: string;
  tickSpacing?: Partial<{ x: number; y: number }>;
  edgeTitleInset?: Partial<{ top: number; right: number; bottom: number; left: number }>;
  legendInset?: Partial<{ top: number; left: number }>;
  legendPosition?: ChartLegendPosition;
  plot?: ChartStyleRuleDefinition;
  axisTitle?: ChartStyleModule['axisTitle'];
}

const D3_STYLE = {
  tickSpacing: { x: 80, y: 56 },
  // Match the D3 gallery convention: the upward y title lives in the chart's
  // top inset close to the axis, but not on the plot's first tick row.
  edgeTitleInset: { top: 12, right: 0, bottom: 4, left: 0 },
  legendInset: { top: 8, left: 8 }
} as const;

/** Define a structural chart-style module. Omitted rules inherit the default. */
export function defineChartStyle(definition: ChartStyleDefinition): ChartStyleModule {
  const key = String(definition?.key || '').trim();
  if (!key) throw new Error('Chart style modules require a key.');
  return Object.freeze({
    key,
    tickSpacing: Object.freeze({ ...D3_STYLE.tickSpacing, ...(definition.tickSpacing || {}) }),
    edgeTitleInset: Object.freeze({
      ...D3_STYLE.edgeTitleInset,
      ...(definition.edgeTitleInset || {})
    }),
    legendInset: Object.freeze({ ...D3_STYLE.legendInset, ...(definition.legendInset || {}) }),
    legendPosition: definition.legendPosition || 'top',
    plot: Object.freeze({ ...definition.plot, ...(definition.plot?.margin ? { margin: Object.freeze({ ...definition.plot.margin }) } : {}) }),
    axisTitle: definition.axisTitle || directionalAxisTitle
  });
}

const GENERIC_CHART_STYLE: ChartStyleRule = {
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  grid: 'none', openXDomain: false, openYDomain: false, edgeTitles: false
};

/** Restrained D3-inspired grammar used when no style module is supplied. */
export const d3ChartStyle = defineChartStyle({ key: 'd3' });

const PAPER_MARGIN = { top: 28, right: 20, bottom: 50, left: 62 };
const PAPER_CARTESIAN = {
  margin: PAPER_MARGIN,
  grid: 'horizontal' as const,
  openXDomain: false,
  openYDomain: false,
  edgeTitles: false
};

/** Print-oriented spacing paired with the scoped `.vd-style-paper` CSS preset. */
export const paperChartStyle = defineChartStyle({
  key: 'paper',
  tickSpacing: { x: 92, y: 62 },
  legendPosition: 'right',
  legendInset: { top: 4, left: 16 },
  plot: PAPER_CARTESIAN,
  axisTitle: channel => channel?.title
});

/** Compact high-contrast spacing paired with the scoped `.vd-style-dark` CSS preset. */
export const darkChartStyle = defineChartStyle({
  key: 'dark',
  tickSpacing: { x: 66, y: 46 },
  edgeTitleInset: { top: 11 },
  plot: { margin: { top: 54, right: 18, bottom: 38 }, grid: 'horizontal' }
});

/** Built-in structural presets. Their matching CSS ships in `visdelta/style.css`. */
export const chartStylePresets = Object.freeze({
  d3: d3ChartStyle,
  paper: paperChartStyle,
  dark: darkChartStyle
});

/** Compose an optional plot capability: neutral values, local defaults, theme overrides. */
export function resolvePlotStyle(
  defaults: ChartStyleRuleDefinition = {},
  theme?: ChartStyleModule
): ChartStyleRule {
  const override = theme?.plot ?? {};
  return {
    ...GENERIC_CHART_STYLE, ...defaults, ...override,
    margin: { ...GENERIC_CHART_STYLE.margin, ...defaults.margin, ...override.margin }
  };
}

/** Resolve plugin defaults and the host theme once when the plugin is created. */
export function resolveChartPresentation(
  defaults: ChartPresentationDefinition = {},
  theme: ChartStyleModule = d3ChartStyle
): ChartPresentation {
  const plot = resolvePlotStyle(defaults.plot, theme);
  return Object.freeze({
    theme,
    plot: Object.freeze({ ...plot, margin: Object.freeze({ ...plot.margin }) })
  });
}

export function responsiveTickCount(length: number, spacing: number): number {
  return Math.max(2, Math.floor(Math.max(0, length) / spacing));
}

export function directionalAxisTitle(
  channel: ChannelSpec | undefined,
  direction: 'right' | 'up'
): string | undefined {
  const title = channel?.title;
  if (!title) return undefined;
  return direction === 'right' ? `${title} →` : `↑ ${title}`;
}
