import type { HeadingLine, renderChartShell } from './chart-shell.js';

type Headed = { title?: unknown; subtitle?: unknown };
type ShellHeading = ReturnType<typeof renderChartShell>['heading'];

/** The text a state declares for a heading; blank text declares none. */
const textOf = (value: unknown): string => (typeof value === 'string' && value.trim() ? value : '');

/** The spec without its title and subtitle, so routes, frames and caches never see them. */
export function bareLayout<S extends object>(spec: S): S {
  if (!('title' in spec) && !('subtitle' in spec)) return spec;
  const { title: _title, subtitle: _subtitle, ...rest } = spec as Headed & Record<string, unknown>;
  return rest as S;
}

/**
 * Every heading text a set of states declares. When the canvas height follows
 * its container, a sequence gives each leg the whole set, so every leg holds the
 * same room and the canvas never moves where one leg hands over to the next.
 */
export interface HeadingReservation { title: string[]; subtitle: string[] }

/** Set by sequence(), read by transition(); not part of the public options. */
export const headingReservations = new WeakMap<object, HeadingReservation>();

export function reserveHeadings(specs: Headed[]): HeadingReservation {
  const distinct = (pick: (spec: Headed) => unknown) => [...new Set(specs.map(spec => textOf(pick(spec))).filter(Boolean))];
  return { title: distinct(spec => spec.title), subtitle: distinct(spec => spec.subtitle) };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Title and subtitle follow the authored progress `p` of the pair, not the route,
 * so `p` alone determines the picture and reverse playback shows the same frames
 * backward. The old text fades out over the first half and the new text fades in
 * over the second, so no frame shows both.
 *
 * The heading's room moves with the same `p`. Its height runs between the natural
 * height of the old heading (the first frame is exactly the old state drawn on
 * its own) and that of the new one, so the canvas, whose own layout does not
 * depend on it, only slides. When the canvas height follows its container the
 * canvas must be laid out for one room; the heading then holds the room of the
 * taller text throughout, and `reservation` extends that to a whole sequence.
 */
export function createHeading(shell: ShellHeading, from: Headed, to: Headed, reservation?: HeadingReservation) {
  const lines = ([
    [shell.title, textOf(from.title), textOf(to.title), reservation?.title ?? []],
    [shell.subtitle, textOf(from.subtitle), textOf(to.subtitle), reservation?.subtitle ?? []],
  ] as Array<[HeadingLine, string, string, string[]]>).map(([line, before, after, reserved]) => {
    line.from.textContent = before;
    // An unchanged heading is one static text.
    line.to.textContent = before === after ? '' : after;
    // Texts this pair does not show still count toward the room a held line takes.
    const sizers = reserved.filter(text => text !== before && text !== after).map(text => {
      const sizer = document.createElement('span');
      sizer.textContent = text;
      sizer.style.display = 'none';
      sizer.style.visibility = 'hidden';
      sizer.setAttribute('aria-hidden', 'true');
      line.element.append(sizer);
      return sizer;
    });
    return { line, before, after, changes: before !== after, sizers };
  });

  let hold = false;
  let heights: { from: number; to: number } | null = null;
  let current = 0;

  function apply(p: number) {
    current = p = clamp(p);
    for (const { line, before, after, changes, sizers } of lines) {
      // A line takes room only while some text of it can be shown.
      const present = hold ? Boolean(before || after || sizers.length) : p <= 0 ? Boolean(before) : p >= 1 ? Boolean(after) : Boolean(before || after);
      line.element.hidden = !present;
      for (const sizer of sizers) sizer.style.display = hold ? '' : 'none';
      if (!changes) {
        showSpan(line.from, 1, true);
        continue;
      }
      showSpan(line.from, clamp(1 - 2 * p), p < 0.5);
      showSpan(line.to, clamp(2 * p - 1), p > 0.5);
    }
    const hidden = lines.every(({ line }) => line.element.hidden);
    shell.header.hidden = hidden;
    // Between the endpoints the header is as tall as the interpolated room; at an
    // endpoint it is just its own content, exactly as when drawn alone.
    const interpolate = !hold && heights !== null && p > 0 && p < 1;
    shell.header.style.height = interpolate ? `${heights!.from + (heights!.to - heights!.from) * p}px` : '';
    shell.header.style.overflow = interpolate ? 'hidden' : '';
  }

  /** `shown` means this text is the one on screen; otherwise it is gone, or only holds room. */
  function showSpan(element: HTMLElement, opacity: number, shown: boolean) {
    const visible = shown && opacity > 0;
    const visibility = visible ? 'visible' : 'hidden';
    if (element.style.visibility !== visibility) element.style.visibility = visibility;
    const display = visible || hold ? '' : 'none';
    if (element.style.display !== display) element.style.display = display;
    const next = visible && opacity < 1 ? String(opacity) : '';
    if (element.style.opacity !== next) element.style.opacity = next;
  }

  return {
    progress: apply,
    /** Hold the room of the taller text instead of interpolating it (canvas height follows its container). */
    hold(on: boolean) {
      if (hold === on) return;
      hold = on;
      heights = null;
      apply(current);
    },
    /** Read the natural height of each endpoint's heading; the container must be laid out. */
    measure() {
      if (hold) return;
      const natural = (p: number) => {
        apply(p);
        return shell.header.hidden ? 0 : shell.header.getBoundingClientRect().height;
      };
      const restore = current;
      heights = { from: natural(0), to: natural(1) };
      apply(restore);
    },
  };
}
