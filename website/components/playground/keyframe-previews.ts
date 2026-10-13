'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VisualizationTransition } from 'visdelta/transition';
import { loadRuntime, svgSnapshot, type ChartState } from '@/components/interactive/runtime';

export type KeyframePreview = { image?: string; error?: boolean };

/** Render saved keyframes one at a time through a disposable offscreen renderer. */
export function useKeyframePreviews(frames: { id: number; state: ChartState }[]) {
  const [previews, setPreviews] = useState<Record<number, KeyframePreview>>({});
  const current = useRef(frames);
  useLayoutEffect(() => { current.current = frames; }, [frames]);
  const cache = useRef(new Map<number, KeyframePreview>());
  const pending = useRef<number | null>(null);
  const queued = useRef<number[]>([]);
  const running = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (alive.current) {
        const next = pending.current ?? queued.current.shift() ?? null;
        pending.current = null;
        if (next === null) break;
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

  const request = useCallback((id: number | null) => {
    pending.current = id !== null && !cache.current.has(id) ? id : null;
    void drain();
  }, [drain]);

  const requestAll = useCallback((ids: number[]) => {
    const scheduled = new Set(queued.current);
    for (const id of ids) {
      if (!cache.current.has(id) && id !== pending.current && !scheduled.has(id)) {
        queued.current.push(id);
        scheduled.add(id);
      }
    }
    void drain();
  }, [drain]);

  useEffect(() => {
    alive.current = true;
    const observer = new MutationObserver(() => {
      generation.current++;
      cache.current.clear();
      setPreviews({});
      pending.current = null;
      queued.current = current.current.map(frame => frame.id);
      void drain();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const invalidate = () => { alive.current = false; generation.current++; pending.current = null; queued.current = []; observer.disconnect(); };
    return invalidate;
  }, [drain]);

  useEffect(() => {
    const ids = new Set(frames.map(frame => frame.id));
    for (const id of cache.current.keys()) if (!ids.has(id)) cache.current.delete(id);
    setPreviews(Object.fromEntries(cache.current));
    if (!frames.length) { generation.current++; pending.current = null; queued.current = []; }
  }, [frames]);

  return { previews, request, requestAll };
}
