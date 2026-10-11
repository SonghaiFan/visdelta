import type { VisualizationWarning } from '../types/index.js';

const previous = new WeakMap<Element, string>();
/** Per-host deduplication keeps scrubbing and replay from flooding the console. */
export function reportVisualizationWarnings(host: Element, warnings: VisualizationWarning[]): void {
  const signature = JSON.stringify(warnings);
  if (previous.get(host) === signature) return;
  previous.set(host, signature);
  host.setAttribute('data-visdelta-warnings', signature);
  for (const item of warnings) console.warn(`[VisDelta ${item.code}] ${item.message}`, item);
  const Event = host.ownerDocument?.defaultView?.CustomEvent;
  if (Event) host.dispatchEvent(new Event('visdelta:warnings', { detail: warnings, bubbles: true }));
}
