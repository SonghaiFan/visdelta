'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { Pause, Play, RotateCcw, Undo2 } from 'lucide-react';
import type { ChartStyleModule } from 'visdelta/chart-style';
import type { StateChange } from 'visdelta/core';
import type { VisualizationSequence, VisualizationTransition } from 'visdelta/transition';
import { cn } from '@/lib/cn';
import { exampleLoaders, exampleStates } from './loaders';

type Controller = VisualizationTransition | VisualizationSequence;

export type ChartStyleName = 'd3' | 'editorial' | 'paper';

export interface TransitionPlayerProps {
  /** Example id from `examples/registry.ts`. */
  example: string;
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
  /** Rendered beside the transport controls, e.g. parameter selects. */
  toolbar?: ReactNode;
  className?: string;
}

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

const SPEEDS = [
  { label: '0.5×', factor: 2 },
  { label: '1×', factor: 1 },
  { label: '2×', factor: 0.5 },
] as const;

/**
 * Mounts a real VisDelta transition (or sequence) for one example module and
 * drives it with external controls, exactly as an application would: every
 * control calls `progress()`, `play()` or `pause()` on the controller.
 */
export function TransitionPlayer({
  example,
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
  /** Last shown progress; restored when a parameter change rebuilds the controller. */
  const valueRef = useRef(0);
  const loopTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [value, setValue] = useState(0);
  const [max, setMax] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [visible, setVisible] = useState(false);
  const [changes, setChanges] = useState<StateChange[][]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [requested, setRequested] = useState(false);
  const interactedRef = useRef(false);
  const [interacted, setInteracted] = useState(false);
  const { resolvedTheme } = useTheme();
  const sliderId = useId();

  const stopTracking = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (loopTimerRef.current !== null) window.clearTimeout(loopTimerRef.current);
    loopTimerRef.current = null;
  }, []);

  // Defer all work until the example is near the viewport.
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

  // Create the controller. Each effect run owns a private mount element so a
  // pending creation from a previous run can never write into the new one.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !requested) return;
    let cancelled = false;
    let created: Controller | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const mount = document.createElement('div');
    mount.className = 'vd-docs-mount';
    host.appendChild(mount);
    setStatus({ kind: 'loading' });

    (async () => {
      const loader = exampleLoaders[example];
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
        states.length > 2
          ? await runtime.sequence(states, options)
          : await runtime.transition(states[0], states[1], options);
      if (cancelled) {
        controller.destroy();
        return;
      }
      created = controller;
      controllerRef.current = controller;
      const legs: StateChange[][] = [];
      for (let index = 0; index < states.length - 1; index += 1) {
        legs.push(core.delta(states[index], states[index + 1]).stateChanges);
      }
      setChanges(legs);
      setMax(states.length - 1);
      const restored = Math.min(valueRef.current, states.length - 1);
      if (restored > 0) controller.progress(restored);
      setValue(controller.value);
      setPlaying(false);
      setStatus({ kind: 'ready' });
      // Pair controllers observe their own width; a sequence is refreshed here.
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
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      cancelled = true;
      stopTracking();
      resizeObserver?.disconnect();
      created?.destroy();
      if (controllerRef.current === created) controllerRef.current = null;
      mount.remove();
    };
  }, [example, height, chartStyle, requested, stopTracking]);

  // VisDelta reads colour tokens at render time; refresh on theme changes.
  useEffect(() => {
    controllerRef.current?.resize();
  }, [resolvedTheme]);

  const track = useCallback(
    (target: number, onDone?: () => void) => {
      const controller = controllerRef.current;
      if (!controller) return;
      const step = () => {
        setValue(controller.value);
        if (Math.abs(controller.value - target) < 1e-4) {
          frameRef.current = null;
          setPlaying(false);
          onDone?.();
          return;
        }
        frameRef.current = requestAnimationFrame(step);
      };
      frameRef.current = requestAnimationFrame(step);
    },
    [],
  );

  const playTo = useCallback(
    (target: number, from?: number, onDone?: () => void) => {
      const controller = controllerRef.current;
      if (!controller) return;
      stopTracking();
      const start = from ?? controller.value;
      if (Math.abs(start - target) < 1e-4) return;
      controller.play({ from: start, to: target, duration: duration * speed });
      setPlaying(true);
      track(target, onDone);
    },
    [duration, speed, stopTracking, track],
  );

  // Ping-pong autoplay while visible, unless the reader prefers reduced motion.
  const autoplaying = autoplay && !reducedMotion && visible && status.kind === 'ready';
  useEffect(() => {
    if (!autoplaying || interacted) return;
    const step = () => {
      const controller = controllerRef.current;
      if (!controller) return;
      const target = controller.value >= max - 1e-4 ? 0 : max;
      playTo(target, undefined, () => {
        loopTimerRef.current = window.setTimeout(step, 1100);
      });
    };
    loopTimerRef.current = window.setTimeout(step, 500);
    return () => {
      // Once the reader takes control, their own playback must keep running.
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

  const onPlayPause = () => {
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
    const atEnd = controller.value >= max - 1e-4;
    playTo(atEnd ? 0 : max, atEnd ? max : undefined);
  };

  const onRestart = () => {
    takeControl();
    playTo(max, 0);
  };

  const onReverse = () => {
    takeControl();
    const controller = controllerRef.current;
    if (!controller) return;
    playTo(controller.value <= 1e-4 ? max : 0);
  };

  const onScrub = (next: number) => {
    takeControl();
    const controller = controllerRef.current;
    if (!controller) return;
    stopTracking();
    controller.progress(next);
    setPlaying(false);
    setValue(controller.value);
  };

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const ready = status.kind === 'ready';
  const leg = Math.min(changes.length - 1, Math.max(0, Math.ceil(value) - 1));
  const legChanges = changes[leg] ?? [];
  const fraction = max > 0 ? value / max : 0;

  return (
    <figure
      className={cn(
        'not-prose my-6 overflow-hidden rounded-lg border bg-fd-card text-fd-card-foreground',
        className,
      )}
      aria-label={label}
    >
      <div className="relative">
        <div
          ref={hostRef}
          className="vd-docs-chart px-2 pt-3"
          style={{ minHeight: height + 12 }}
          aria-busy={!ready}
        />
        {status.kind !== 'ready' && (
          <div
            className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-fd-muted-foreground"
            role={status.kind === 'error' ? 'alert' : 'status'}
            data-example-error={status.kind === 'error' ? '' : undefined}
          >
            {status.kind === 'error' ? (
              <span className="max-w-md">
                <strong className="block font-medium text-fd-foreground">This example could not render.</strong>
                <code className="mt-1 block text-xs">{status.message}</code>
              </span>
            ) : (
              <span className="font-mono text-xs uppercase tracking-wider">Preparing transition…</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-3 py-2">
        <div className="flex items-center gap-1">
          <IconButton label={playing ? 'Pause' : 'Play'} onClick={onPlayPause} disabled={!ready}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </IconButton>
          <IconButton label="Restart from the first state" onClick={onRestart} disabled={!ready}>
            <RotateCcw className="size-4" />
          </IconButton>
          <IconButton label="Play in reverse" onClick={onReverse} disabled={!ready}>
            <Undo2 className="size-4" />
          </IconButton>
        </div>

        <label htmlFor={sliderId} className="sr-only">
          Transition progress
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={max}
          step={0.001}
          value={value}
          disabled={!ready}
          onChange={(event) => onScrub(event.currentTarget.valueAsNumber)}
          className="vd-scrubber min-w-32 flex-1"
          style={{ '--fill': `${fraction * 100}%` } as React.CSSProperties}
        />
        <output
          htmlFor={sliderId}
          className="w-12 text-right font-mono text-xs tabular-nums text-fd-muted-foreground"
        >
          {value.toFixed(2)}
        </output>

        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.currentTarget.value))}
            className="h-7 rounded-sm border bg-transparent px-1.5 font-mono text-xs"
          >
            {SPEEDS.map((option) => (
              <option key={option.label} value={option.factor}>
                {option.label}
              </option>
            ))}
          </select>
          {toolbar}
        </div>
      </div>

      {inspector && ready && (
        <figcaption className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2 text-xs">
          <span className="mr-1 font-mono uppercase tracking-wider text-fd-muted-foreground">
            {max > 1 ? `Leg ${leg + 1}` : 'delta()'}
          </span>
          {legChanges.length === 0 ? (
            <span className="text-fd-muted-foreground">No state change</span>
          ) : (
            legChanges.map((change, index) => (
              <StateChangeChip key={`${leg}-${index}`} change={change} />
            ))
          )}
        </figcaption>
      )}
    </figure>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex size-8 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground disabled:pointer-events-none disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}

export function StateChangeChip({ change }: { change: StateChange }) {
  const detail =
    'channel' in change && change.channel
      ? change.channel
      : 'property' in change
        ? change.property
        : 'target' in change
          ? change.target
          : null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono"
      data-category={change.category}
    >
      <span className="vd-category-dot" aria-hidden="true" />
      <span>{change.category}</span>
      <span className="text-fd-muted-foreground">·</span>
      <span>{change.action}</span>
      {detail && <span className="text-fd-muted-foreground">({detail})</span>}
    </span>
  );
}
