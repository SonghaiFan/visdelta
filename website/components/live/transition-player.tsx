'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { Pause, Play } from 'lucide-react';
import type { ChartStyleModule } from 'visdelta/chart-style';
import type { StateChange } from 'visdelta/core';
import type { VisualizationSequence, VisualizationTransition } from 'visdelta/transition';
import { Scrubber } from '@/components/interactive/scrubber';
import { cn } from '@/lib/cn';
import { exampleLoaders, exampleStates, type ExampleModule } from './loaders';

export type Controller = VisualizationTransition | VisualizationSequence;
export type ChartStyleName = 'd3' | 'editorial' | 'paper';

export interface TransitionPlayerProps {
  /** Example id from `examples/registry.ts`. Ignored when `load` is given. */
  example?: string;
  /**
   * Build the states in the browser instead of loading a registered example.
   * Must be referentially stable (memoize it); a new function rebuilds the chart.
   */
  load?: () => Promise<ExampleModule>;
  /** Called with the mounted controller, e.g. to inspect its delta. */
  onReady?: (controller: Controller) => void;
  /** Canvas height in pixels. */
  height?: number;
  /** Milliseconds per serial route stage. */
  duration?: number;
  /** Structural chart style passed to `transition({ chartStyle })`. */
  chartStyle?: ChartStyleName;
  /** Play back and forth while visible. Disabled under reduced motion. */
  autoplay?: boolean;
  /** Show the state changes reported by `delta()`. */
  inspector?: boolean;
  /** Accessible name for the chart region. */
  label?: string;
  /** Rendered after the transport, e.g. parameter selects. */
  toolbar?: ReactNode;
  className?: string;
}

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

const EPSILON = 1e-4;

/** `encoding.remap(y)` — the compact form used in every Δ readout. */
export function formatChange(change: StateChange) {
  const detail =
    'channel' in change && change.channel
      ? change.channel
      : 'property' in change
        ? change.property
        : 'target' in change
          ? change.target
          : null;
  return `${change.category}.${change.action}${detail ? `(${detail})` : ''}`;
}

/**
 * Mounts a real VisDelta transition (or sequence) and drives it the way an
 * application would: every control calls `progress()`, `play()` or `pause()`.
 * One button plays toward the far end, so it also reverses.
 */
export function TransitionPlayer({
  example,
  load,
  onReady,
  height = 320,
  duration = 800,
  chartStyle = 'd3',
  autoplay = false,
  inspector = true,
  label,
  toolbar,
  className,
}: TransitionPlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<Controller | null>(null);
  const frameRef = useRef<number | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const valueRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const [direction, setDirectionState] = useState<1 | -1>(1);
  const setDirection = useCallback((next: 1 | -1) => {
    directionRef.current = next;
    setDirectionState(next);
  }, []);
  const interactedRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [value, setValue] = useState(0);
  const [max, setMax] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [requested, setRequested] = useState(false);
  const [changes, setChanges] = useState<StateChange[][]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const stopTracking = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (loopTimerRef.current !== null) window.clearTimeout(loopTimerRef.current);
    loopTimerRef.current = null;
  }, []);

  // Defer all work until the chart is near the viewport.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setRequested(true);
      },
      { rootMargin: '240px 0px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Create the controller in a private mount, so a pending creation from a
  // previous run can never write into the new one. The previous chart stays on
  // screen until its replacement is ready, so parameter changes never flash.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !requested) return;
    let cancelled = false;
    let created: Controller | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const mount = document.createElement('div');
    mount.style.cssText = 'position:absolute;inset:0;visibility:hidden;pointer-events:none;';
    host.appendChild(mount);

    (async () => {
      const loader = load ?? (example ? exampleLoaders[example] : undefined);
      if (!loader) throw new Error(`Unknown example "${example}".`);
      const [module, runtime, styles, core] = await Promise.all([
        loader(),
        import('visdelta/transition'),
        import('visdelta/chart-style'),
        import('visdelta/core'),
      ]);
      const states = exampleStates(module);
      const styleModule: ChartStyleModule = styles.chartStylePresets[chartStyle];
      const options = { target: mount, height, chartStyle: styleModule };
      const controller: Controller =
        states.length > 2 ? await runtime.sequence(states, options) : await runtime.transition(states[0], states[1], options);
      if (cancelled) {
        controller.destroy();
        return;
      }
      created = controller;
      const restored = Math.min(valueRef.current, states.length - 1);
      if (restored > 0) controller.progress(restored);
      // Swap: the new chart takes the place of the old one in a single frame.
      controllerRef.current?.destroy();
      for (const child of [...host.children]) if (child !== mount) child.remove();
      mount.style.cssText = '';
      controllerRef.current = controller;
      const legs: StateChange[][] = [];
      for (let index = 0; index < states.length - 1; index += 1) {
        legs.push(core.delta(states[index], states[index + 1]).stateChanges);
      }
      setChanges(legs);
      setMax(states.length - 1);
      setValue(controller.value);
      setPlaying(false);
      setStatus({ kind: 'ready' });
      onReadyRef.current?.(controller);
      if (states.length > 2 && typeof ResizeObserver !== 'undefined') {
        let width = mount.clientWidth;
        resizeObserver = new ResizeObserver(() => {
          if (mount.clientWidth === width) return;
          width = mount.clientWidth;
          controller.resize();
        });
        resizeObserver.observe(mount);
      }
    })().catch((error: unknown) => {
      if (cancelled) return;
      mount.remove();
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      cancelled = true;
      stopTracking();
      resizeObserver?.disconnect();
      created?.pause();
      if (!created) mount.remove();
    };
  }, [example, load, height, chartStyle, requested, stopTracking]);

  // Destroy whatever is mounted when the player itself unmounts.
  useEffect(
    () => () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    },
    [],
  );

  // VisDelta reads colour tokens at render time; refresh on theme changes.
  useEffect(() => {
    controllerRef.current?.resize();
  }, [resolvedTheme]);

  const playTo = useCallback(
    (target: number, onDone?: () => void) => {
      const controller = controllerRef.current;
      if (!controller) return;
      stopTracking();
      const start = controller.value;
      if (Math.abs(start - target) < EPSILON) return;
      setDirection(target > start ? 1 : -1);
      controller.play({ from: start, to: target, duration });
      setPlaying(true);
      const step = () => {
        setValue(controller.value);
        if (Math.abs(controller.value - target) < EPSILON) {
          frameRef.current = null;
          setPlaying(false);
          onDone?.();
          return;
        }
        frameRef.current = requestAnimationFrame(step);
      };
      frameRef.current = requestAnimationFrame(step);
    },
    [duration, setDirection, stopTracking],
  );

  // Ping-pong autoplay while visible, unless the reader prefers reduced motion.
  const autoplaying = autoplay && !reducedMotion && visible && status.kind === 'ready';
  useEffect(() => {
    if (!autoplaying || interacted) return;
    const step = () => {
      const controller = controllerRef.current;
      if (!controller) return;
      playTo(controller.value >= max - EPSILON ? 0 : max, () => {
        loopTimerRef.current = window.setTimeout(step, 1400);
      });
    };
    loopTimerRef.current = window.setTimeout(step, 600);
    return () => {
      if (interactedRef.current) return;
      stopTracking();
      controllerRef.current?.pause();
      setPlaying(false);
    };
  }, [autoplaying, interacted, max, playTo, stopTracking]);

  const takeControl = () => {
    interactedRef.current = true;
    setInteracted(true);
  };

  const onPlay = () => {
    takeControl();
    const controller = controllerRef.current;
    if (!controller) return;
    if (playing) {
      stopTracking();
      controller.pause();
      setPlaying(false);
      setValue(controller.value);
      return;
    }
    const current = controller.value;
    playTo(current >= max - EPSILON ? 0 : current <= EPSILON ? max : directionRef.current > 0 ? max : 0);
  };

  const onScrub = (next: number) => {
    takeControl();
    const controller = controllerRef.current;
    if (!controller) return;
    stopTracking();
    setDirection(next >= controller.value ? 1 : -1);
    controller.progress(next);
    setPlaying(false);
    setValue(controller.value);
  };

  const ready = status.kind === 'ready';
  const leg = Math.min(changes.length - 1, Math.max(0, Math.ceil(value - EPSILON) - 1));
  const legChanges = changes[leg] ?? [];
  const towardA = value >= max - EPSILON || (value > EPSILON && direction < 0);
  const playLabel = playing ? 'Pause' : towardA ? 'Play back to A' : 'Play to B';

  return (
    <figure className={cn('not-prose my-8', className)} aria-label={label}>
      <div className="relative">
        <div ref={hostRef} className="vd-docs-chart relative" style={{ minHeight: height }} aria-busy={!ready} />
        {status.kind !== 'ready' && (
          <div
            className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-fd-muted-foreground"
            role={status.kind === 'error' ? 'alert' : 'status'}
            data-example-error={status.kind === 'error' ? '' : undefined}
          >
            {status.kind === 'error' ? (
              <span className="max-w-md">
                <span className="block text-fd-foreground">This chart could not render.</span>
                <code className="mt-1 block text-xs">{status.message}</code>
              </span>
            ) : (
              <span className="vd-label animate-pulse">Preparing transition</span>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          aria-label={playLabel}
          title={playLabel}
          onClick={onPlay}
          disabled={!ready}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-fd-foreground transition-colors hover:bg-fd-accent disabled:opacity-40"
        >
          {playing ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className={cn('size-3.5 transition-transform duration-300', towardA ? 'rotate-180' : 'translate-x-px')} />
          )}
        </button>
        <Scrubber value={value} max={max} onChange={onScrub} disabled={!ready} className="min-w-32 flex-1" />
        <output className="w-10 text-right font-mono text-xs tabular-nums text-fd-muted-foreground">{value.toFixed(2)}</output>
        {toolbar && <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">{toolbar}</div>}
      </div>

      {inspector && ready && (
        <figcaption className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pl-11 font-mono text-xs text-fd-muted-foreground">
          <span className="font-sans font-semibold text-[var(--color-delta)]" title="State changes reported by delta()">
            Δ
          </span>
          {max > 1 && <span>leg {leg + 1}</span>}
          {legChanges.length === 0 ? (
            <span>no state change</span>
          ) : (
            legChanges.map((change, index) => (
              <span key={`${leg}-${index}`} data-category={change.category} className="text-fd-foreground/80">
                {formatChange(change)}
              </span>
            ))
          )}
        </figcaption>
      )}
    </figure>
  );
}
