'use client';
/**
 * A preview window that floats over the workspace: dragged by its title bar and
 * resized from its edges. Resizing explicitly edits the canvas dimensions;
 * Fit then scales the figure for display. Geometry is measured when a gesture starts (never during
 * render) and kept in pixels relative to the workspace.
 */
import { useCallback, useState, type PointerEvent, type RefObject } from 'react';

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

const MIN = { w: 120, h: 120 };
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/**
 * `bounds` is the workspace the window stays inside; `inset` names the element
 * inside it (the toolbar) that the window must not cover.
 */
export function useFloatingWindow(bounds: RefObject<HTMLElement | null>, windowRef: RefObject<HTMLElement | null>, inset: string, onResize?: (size: { width: number; height: number }) => void, fixedSize = false) {
  /** null: the stylesheet's default place, until the reader moves or resizes it. */
  const [rect, setRect] = useState<FloatRect | null>(null);
  const [resizeEdge, setResizeEdge] = useState<Edge | null>(null);

  const measure = useCallback(() => {
    const area = bounds.current?.getBoundingClientRect();
    const box = windowRef.current?.getBoundingClientRect();
    if (!area || !box) return null;
    const top = bounds.current!.querySelector(inset)?.getBoundingClientRect().bottom ?? area.top;
    const bar = windowRef.current!.querySelector('.pg-viewbar')?.getBoundingClientRect();
    const chrome = bar ? box.top - bar.top : 0;
    return {
      area,
      minY: top - area.top + chrome,
      maxY: area.height - 24,
      start: { x: box.left - area.left, y: box.top - area.top, w: box.width, h: box.height },
    };
  }, [bounds, windowRef, inset]);

  /** Follow the pointer until it is released. */
  const track = useCallback((event: PointerEvent<HTMLElement>, update: (dx: number, dy: number) => void, resize?: Edge) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    if (resize) setResizeEdge(resize);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = resize ? getComputedStyle(handle).cursor : 'grabbing';
    const origin = { x: event.clientX, y: event.clientY };
    const move = (next: globalThis.PointerEvent) => update(next.clientX - origin.x, next.clientY - origin.y);
    const end = () => {
      setResizeEdge(null);
      document.body.style.cursor = previousCursor;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      handle.removeEventListener('lostpointercapture', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
  }, []);

  const startMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || (event.target as Element).closest('button, input, label, select, summary, details')) return;
      const m = measure();
      if (!m) return;
      track(event, (dx, dy) =>
        setRect({
          ...m.start,
          x: clamp(m.start.x + dx, 0, m.area.width - m.start.w),
          y: clamp(m.start.y + dy, m.minY, m.maxY - m.start.h),
        }),
      );
    },
    [measure, track],
  );

  const startResize = useCallback(
    (edge: Edge) => (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const m = measure();
      if (!m) return;
      const { start } = m;
      track(event, (dx, dy) => {
        dx = Math.round(dx);
        dy = Math.round(dy);
        let { x, y, w, h } = start;
        if (edge.includes('e')) w = clamp(start.w + dx, MIN.w, m.area.width - start.x);
        if (edge.includes('s')) h = clamp(start.h + dy, MIN.h, m.maxY - start.y);
        if (edge.includes('w')) {
          x = clamp(start.x + dx, 0, start.x + start.w - MIN.w);
          w = start.x + start.w - x;
        }
        if (edge.includes('n')) {
          y = clamp(start.y + dy, m.minY, start.y + start.h - MIN.h);
          h = start.y + start.h - y;
        }
        setRect({ x, y, w, h });
        onResize?.({ width: w, height: h });
      }, edge);
    },
    [measure, onResize, track],
  );

  /** Keep the window inside the workspace after the workspace itself resized. */
  const contain = useCallback(() => {
    setRect((current) => {
      const area = bounds.current?.getBoundingClientRect();
      if (!current || !area) return current;
      const box = windowRef.current?.getBoundingClientRect();
      const width = box?.width ?? current.w;
      const height = box?.height ?? current.h;
      const w = fixedSize ? width : Math.min(width, area.width);
      const h = fixedSize ? height : Math.min(height, area.height);
      const x = clamp(current.x, 0, area.width - w);
      const y = clamp(current.y, 0, area.height - h);
      return x === current.x && y === current.y && w === current.w && h === current.h ? current : { x, y, w, h };
    });
  }, [bounds, fixedSize, windowRef]);

  const reset = useCallback(() => setRect(null), []);

  return { rect, resizing: resizeEdge !== null, resizeEdge, startMove, startResize, contain, reset };
}
