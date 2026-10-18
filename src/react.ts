'use client';

import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import type { HTMLAttributes, ReactElement } from 'react';
import type { Visualization } from './core.js';
import { transition } from './transition.js';
import type { TransitionOptions, VisualizationTransition } from './transition.js';
import { sequence } from './sequence.js';
import type { VisualizationSequence } from './sequence.js';

export type ChartController = VisualizationTransition | VisualizationSequence;
type Controller = ChartController;
type Options = Omit<TransitionOptions, 'target'>;

/** The component owns its host and controller; controls remain with the caller. */
interface ChartHostProps<C = ChartController> extends Options,
  Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML' | 'onError'> {
  /** Called after mounting. An optional returned cleanup runs before replacement or unmount. */
  onReady?: (controller: C) => void | (() => void);
  /** Failed replacements leave the previous chart visible. Without this callback, errors reach React's error boundary. */
  onError?: (error: Error) => void;
}

export interface ChartProps extends ChartHostProps {
  /** One state, or an ordered, non-empty array of states. Keep arrays stable between renders. */
  state: Visualization | readonly Visualization[];
  /** Authored state position: 0 is the first state, 1 the second. Single states stay at 0. */
  progress?: number;
}

/** One host for a static state, a pair, or a sequence of authored states. */
export function Chart({ state, progress, ...props }: ChartProps): ReactElement {
  const count = Array.isArray(state) ? state.length : 1;
  const build = useMemo(() => async (options: TransitionOptions): Promise<Controller> => {
    const inputs: readonly Visualization[] = Array.isArray(state) ? state : [state as Visualization];
    if (!inputs.length) throw new Error('Chart requires at least one visualization state.');
    if (inputs.length > 2) return sequence(inputs, options);
    return transition(inputs[0], inputs[1] ?? inputs[0], options);
  }, [state]);
  return createElement(Host<Controller>, { ...props, progress: count === 1 ? 0 : progress, build });
}

function Host<C extends Controller>({
  build, data, chartStyle, width, height, progress, onReady, onError, style, ...attributes
}: ChartHostProps<C> & {
  build: (options: TransitionOptions) => Promise<C>;
  progress?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const live = useRef<{ controller: C; mount: HTMLDivElement; cleanup?: void | (() => void) } | null>(null);
  const latest = useRef({ width, height, progress, onReady, onError });
  const [error, setError] = useState<Error | null>(null);

  // Callback identity and progress updates must never rebuild a chart.
  useEffect(() => {
    latest.current = { width, height, progress, onReady, onError };
  });

  useEffect(() => {
    const host = hostRef.current!;
    let cancelled = false;
    const mount = document.createElement('div');
    mount.style.cssText = 'position:absolute;inset:0;visibility:hidden;pointer-events:none;';
    host.append(mount);
    const initial = latest.current;
    let candidate: C | undefined;

    void (async () => {
      candidate = await build({ target: mount, data, chartStyle, width: initial.width, height: initial.height });
      if (cancelled) {
        candidate.destroy();
        mount.remove();
        return;
      }
      const current = latest.current;
      mount.style.cssText = current.height === 'auto' ? 'height:100%' : '';
      // Progress may have changed while data/modules were loading.
      candidate.progress(current.progress ?? live.current?.controller.value ?? 0);
      const previous = live.current;
      previous?.cleanup?.();
      previous?.controller.destroy();
      previous?.mount.remove();
      live.current = { controller: candidate, mount };
      setError(null);
      live.current.cleanup = current.onReady?.(candidate);
    })().catch((reason: unknown) => {
      // A committed controller remains owned by the component even if onReady throws.
      if (!candidate || live.current?.controller !== candidate) {
        candidate?.destroy();
        mount.remove();
      }
      if (cancelled) return;
      const failure = reason instanceof Error ? reason : new Error(String(reason));
      if (latest.current.onError) latest.current.onError(failure);
      else setError(failure);
    });

    return () => {
      cancelled = true;
      live.current?.controller.pause();
      if (live.current?.mount !== mount) mount.remove();
    };
  }, [build, data, chartStyle, width, height]);

  useEffect(() => {
    if (progress !== undefined) live.current?.controller.progress(progress);
  }, [progress]);

  useEffect(() => () => {
    const current = live.current;
    live.current = null;
    current?.cleanup?.();
    current?.controller.destroy();
    current?.mount.remove();
  }, []);

  if (error) throw error;
  return createElement('div', { ...attributes, ref: hostRef, style: { position: 'relative', ...style } });
}
