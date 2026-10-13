'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VisualizationTransition } from 'visdelta/transition';
import { loadRuntime, svgSnapshot, type ChartState } from '@/components/interactive/runtime';

export type KeyframePreview = { image?: string; error?: boolean };

/** One disposable renderer, with only the most recently requested frame queued. */
export function useKeyframePreviews(frames: { id: number; state: ChartState }[]) {
  const [previews, setPreviews] = useState<Record<number, KeyframePreview>>({});
  const current = useRef(frames);
  useLayoutEffect(() => { current.current = frames; }, [frames]);
  const cache = useRef(new Map<number, KeyframePreview>());
  const pending = useRef<number | null>(null);
  const running = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const observer = new MutationObserver(() => {
      generation.current++;
      cache.current.clear();
      setPreviews({});
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const invalidate = () => { alive.current = false; generation.current++; pending.current = null; observer.disconnect(); };
    return invalidate;
  }, []);

  useEffect(() => {
    const ids = new Set(frames.map(frame => frame.id));
    for (const id of cache.current.keys()) if (!ids.has(id)) cache.current.delete(id);
    setPreviews(Object.fromEntries(cache.current));
    if (!frames.length) { generation.current++; pending.current = null; }
  }, [frames]);

  const request = useCallback(async (id: number | null) => {
    pending.current = id !== null && !cache.current.has(id) ? id : null;
    if (pending.current === null) return;
    if (running.current) return;
    running.current = true;
    try {
      while (pending.current !== null && alive.current) {
        const next = pending.current;
        pending.current = null;
        if (cache.current.has(next)) continue;
        const frame = current.current.find(item => item.id === next);
        if (!frame) continue;
        const token = generation.current;
        const host = document.createElement('div');
        host.className = 'pg-snapshot-render vd-docs-chart';
        host.style.cssText = 'position:fixed;left:-10000px;top:0;width:480px;height:300px;pointer-events:none';
        document.body.append(host);
        let controller: VisualizationTransition | undefined;
        let result: KeyframePreview;
        try {
          const { transition } = await loadRuntime();
          controller = await transition(frame.state as never, frame.state as never, { target: host, width: 480, height: 300 });
          controller.progress(1);
          const image = svgSnapshot(host);
          result = image ? { image } : { error: true };
        } catch { result = { error: true }; }
        finally { controller?.destroy(); host.remove(); }
        if (alive.current && token === generation.current && current.current.some(item => item.id === next)) {
          cache.current.set(next, result);
          setPreviews(Object.fromEntries(cache.current));
        }
      }
    } finally { running.current = false; }
  }, []);
  return { previews, request };
}
