import { format } from 'd3-format';
import type { RuntimeScale } from './render-types.js';

/** Compact decimal labels without scientific notation for everyday magnitudes. */
export function readableNumber(value: number): string {
  const magnitude = Math.abs(value);
  const [divisor, suffix] = magnitude >= 1e9 ? [1e9, 'b']
    : magnitude >= 1e6 ? [1e6, 'm'] : magnitude >= 1e3 ? [1e3, 'k'] : [1, ''];
  // Retain six significant digits, including small nonzero values and endpoints.
  const scaled = value / divisor;
  const precision = scaled === 0 ? 0 : Math.min(20, Math.max(0, 5 - Math.floor(Math.log10(Math.abs(scaled)))));
  return format(`.${precision}~f`)(scaled) + suffix;
}

/** One date granularity across the axis; UTC keeps ISO dates stable across timezones. */
export function readableTickFormat(scale: RuntimeScale, count = 6): ((value: unknown) => string) | undefined {
  if (typeof scale.bandwidth === 'function') return undefined;
  const domain = scale.domain();
  if (scale.__visDeltaChannel?.type === 'temporal' || domain[0] instanceof Date) {
    const start = new Date(Number(domain[0]));
    const end = new Date(Number(domain[domain.length - 1]));
    const ticks = (scale.ticks?.(count) ?? domain).map(Number).sort((a, b) => a - b);
    const gaps = ticks.slice(1).map((value, index) => value - ticks[index]).filter(value => value > 0);
    const interval = gaps.length ? Math.min(...gaps) : Math.abs(+end - +start);
    const differentDay = start.toISOString().slice(0, 10) !== end.toISOString().slice(0, 10);
    const differentYear = start.getUTCFullYear() !== end.getUTCFullYear();
    const options: Intl.DateTimeFormatOptions = interval >= 365 * 864e5 ? { year: 'numeric' }
      : interval >= 28 * 864e5 ? { month: 'short', ...(differentYear ? { year: 'numeric' as const } : {}) }
      : interval >= 864e5 ? { day: 'numeric', month: 'short', ...(differentYear ? { year: 'numeric' as const } : {}) }
      : interval >= 60e3 ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' };
    const formatter = new Intl.DateTimeFormat('en-GB', {
      ...(interval < 864e5 && differentDay ? { day: 'numeric', month: 'short', ...(differentYear ? { year: 'numeric' as const } : {}) } : {}),
      ...options, timeZone: 'UTC'
    });
    return value => formatter.format(new Date(Number(value)));
  }
  // Log scales retain their sparse major/minor tick formatter.
  const channel = scale.__visDeltaChannel;
  if ((channel?.scale?.type || channel?.scaleType) === 'log') return undefined;
  return value => readableNumber(Number(value));
}
