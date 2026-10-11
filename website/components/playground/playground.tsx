'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeltaResult, StateChange } from 'visdelta/core';
import type { VisualizationSequence, VisualizationTransition } from 'visdelta/transition';
import { CodeEditor } from '@/components/interactive/code-editor';
import { loadIdioms } from '@/components/interactive/corpus';
import {
  errorMessage,
  evaluateChart,
  loadCsv,
  loadD3,
  loadFactories,
  loadRuntime,
  prefersReducedMotion,
  type ChartName,
  type ChartState,
  type Rows,
} from '@/components/interactive/runtime';
import { StateChangeIcon } from '@/components/interactive/state-change-icon';
import { formatChange } from '@/components/live/transition-player';
import { categories } from '@/examples/registry';
import { cn } from '@/lib/cn';
import { playgroundDemos, storyFrames, type PlaygroundDemo as Story } from './demos';
import { Timeline } from './timeline';

/** A curated story, or gallery code opened on its own (no category). */
type Opened = Omit<Story, 'category'> & { category?: Story['category'] };

const CHARTS: ChartName[] = ['bar', 'line', 'area', 'point', 'unit'];
const HEIGHT = 420;
/** One live edit. */
const EDIT_DURATION = 750;
/** One leg between kept keyframes. */
const LEG_DURATION = 900;
/** Quiet time after a keystroke before the code runs. */
const SETTLE = 280;
const TYPE_DELAY = 24;
const DELETE_DELAY = 12;
/** Hold between a story's edits. */
const STEP_PAUSE = 1100;
const DEFAULT_STORY = 'sort';

type Controller = VisualizationTransition | VisualizationSequence;
interface Version {
  state: ChartState;
  code: string;
}
interface Keyframe extends Version {
  id: number;
  changes: StateChange[];
}
interface Display {
  layer: HTMLElement;
  controller: Controller;
  kind: 'live' | 'replay';
}
interface Dataset {
  name: string;
  rows: Rows;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const datasetName = (url?: string) => (url ? url.split('/').at(-1)! : 'inline data');
const lineAt = (text: string, offset: number) => text.slice(0, offset).split('\n').length;

/** Lines of `after` that are new since `before` (1-based), ignoring where a chain ends. */
function changedLines(before: string | null | undefined, after: string): number[] {
  if (before == null || before === after) return [];
  const normal = (line: string) => line.trim().replace(/[;,]$/, '');
  const previous = new Set(before.split('\n').map(normal));
  return after.split('\n').flatMap((line, index) => (normal(line) && !previous.has(normal(line)) ? [index + 1] : []));
}

async function compare(a: ChartState, b: ChartState): Promise<DeltaResult> {
  const { delta } = await import('visdelta/core');
  return delta(a as never, b as never);
}
const unchanged = (result: DeltaResult) => !result.stateChanges.length && !result.edits.length && !result.deltas.length;

/**
 * Write a chart and watch it change. Every valid edit is a transition from the
 * chart on screen to the new code. Keep any moment as a keyframe; kept
 * keyframes replay as one continuous `sequence()`.
 */
export function Playground() {
  const stageRef = useRef<HTMLDivElement>(null);
  const factoriesRef = useRef<Awaited<ReturnType<typeof loadFactories>> | null>(null);
  const displayRef = useRef<Display | null>(null);
  /** The state on screen, or the one the live motion is heading to. */
  const shownRef = useRef<Version | null>(null);
  /** The last version of the code that ran. */
  const latestRef = useRef<Version | null>(null);
  const keyframesRef = useRef<Keyframe[]>([]);
  const replayOf = useRef<Keyframe[] | null>(null);
  const datasetRef = useRef<Dataset>({ name: 'inline data', rows: [] });
  const codeRef = useRef('');
  const queueRef = useRef<{ running: Promise<void> | null; pending: Version | null }>({ running: null, pending: null });
  const storyRun = useRef(0);
  const evalRun = useRef(0);
  const replayRun = useRef(0);
  const editTimer = useRef<number | null>(null);
  const nextKey = useRef(1);
  const shownKey = useRef(-1);

  const [story, setStory] = useState<Opened | null>(null);
  const [code, setCode] = useState('');
  const [marked, setMarked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset>({ name: 'inline data', rows: [] });
  const [showRows, setShowRows] = useState(false);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [replaying, setReplaying] = useState(false);
  const [value, setValue] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [changes, setChanges] = useState<StateChange[]>([]);
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);

  const writeCode = useCallback((text: string) => {
    codeRef.current = text;
    setCode(text);
  }, []);

  /** Build a controller in a hidden layer of the stage. */
  const mount = useCallback(async (build: (target: HTMLElement) => Promise<Controller>) => {
    const layer = document.createElement('div');
    layer.className = 'pg-layer';
    layer.dataset.state = 'hidden';
    stageRef.current!.append(layer);
    try {
      return { layer, controller: await build(layer) };
    } catch (cause) {
      layer.remove();
      throw cause;
    }
  }, []);

  /** Show a mounted layer at one exact frame in place of the current one. */
  const show = useCallback((next: Omit<Display, 'kind'>, kind: Display['kind'], at: number, fade = false) => {
    next.controller.progress(at);
    const previous = displayRef.current;
    displayRef.current = { ...next, kind };
    next.layer.dataset.state = fade ? 'entering' : 'shown';
    if (fade) requestAnimationFrame(() => (next.layer.dataset.state = 'shown'));
    if (!previous) return;
    previous.controller.pause();
    const retire = () => {
      previous.controller.destroy();
      previous.layer.remove();
    };
    if (fade) {
      previous.layer.dataset.state = 'leaving';
      window.setTimeout(retire, 240);
    } else {
      retire();
    }
  }, []);

  /** Resolve once `controller` reaches `target`, stops moving, or leaves the screen. */
  const settle = useCallback(
    (controller: Controller, target: number, onFrame?: (value: number) => void) =>
      new Promise<void>((resolve) => {
        let last = controller.value;
        let still = performance.now();
        const step = (now: number) => {
          if (displayRef.current?.controller !== controller) return resolve();
          onFrame?.(controller.value);
          if (Math.abs(controller.value - target) < 1e-4) return resolve();
          if (controller.value !== last) {
            last = controller.value;
            still = now;
          } else if (now - still > 400) {
            return resolve(); // paused
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    [],
  );

  /** Move the chart from what is on screen to `target`. */
  const moveTo = useCallback(
    async (target: Version) => {
      const from = shownRef.current;
      const { transition } = await loadRuntime();
      const options = (layer: HTMLElement) => ({ target: layer, height: HEIGHT });
      if (from && displayRef.current && from.state.toSpec().mark === target.state.toSpec().mark) {
        const difference = await compare(from.state, target.state);
        if (unchanged(difference)) {
          shownRef.current = target;
          return;
        }
        try {
          const next = await mount((layer) => transition(from.state as never, target.state as never, options(layer)));
          shownRef.current = target;
          setChanges(difference.stateChanges);
          setMarked(changedLines(from.code, target.code));
          show(next, 'live', 0);
          if (prefersReducedMotion()) {
            next.controller.progress(1);
            return;
          }
          next.controller.play({ from: 0, to: 1, duration: EDIT_DURATION });
          return settle(next.controller, 1);
        } catch {
          // No route between these two states: fall through to a cross-fade.
        }
      }
      const next = await mount((layer) => transition(target.state as never, target.state as never, options(layer)));
      shownRef.current = target;
      if (!from || from.state.toSpec().mark !== target.state.toSpec().mark) setChanges([]);
      show(next, 'live', 0, true);
    },
    [mount, settle, show],
  );

  /** Queue a move. Only the newest pending version runs; motion never jumps. */
  const present = useCallback(
    (target: Version): Promise<void> => {
      const queue = queueRef.current;
      queue.pending = target;
      queue.running ??= (async () => {
        while (queue.pending) {
          const next = queue.pending;
          queue.pending = null;
          try {
            await moveTo(next);
          } catch (cause) {
            setError(errorMessage(cause));
          }
        }
        queue.running = null;
      })();
      return queue.running;
    },
    [moveTo],
  );

  const evaluate = useCallback(async (source: string) => {
    factoriesRef.current ??= await loadFactories(CHARTS);
    return evaluateChart(source, factoriesRef.current, datasetRef.current.rows);
  }, []);

  /** Stop replaying: the next edit moves on from the keyframe on screen. */
  const goLive = useCallback(() => {
    replayRun.current += 1;
    if (displayRef.current?.kind === 'replay') displayRef.current.controller.pause();
    setPlaying(false);
    setReplaying(false);
  }, []);

  /** Run code; if it is a valid state, the chart moves to it. */
  const run = useCallback(
    async (source: string) => {
      const request = ++evalRun.current;
      try {
        const state = await evaluate(source);
        if (request !== evalRun.current) return;
        setError(null);
        const version = { state, code: source };
        latestRef.current = version;
        goLive();
        await present(version);
      } catch (cause) {
        if (request === evalRun.current) setError(errorMessage(cause));
      }
    },
    [evaluate, goLive, present],
  );

  const onEdit = useCallback(
    (text: string) => {
      storyRun.current += 1; // the reader takes over from a story
      setWriting(false);
      setNotice('');
      writeCode(text);
      if (editTimer.current !== null) window.clearTimeout(editTimer.current);
      editTimer.current = window.setTimeout(() => void run(text), SETTLE);
    },
    [run, writeCode],
  );

  const runNow = useCallback(() => {
    if (editTimer.current !== null) window.clearTimeout(editTimer.current);
    void run(codeRef.current);
  }, [run]);

  /** Keep a version as the next keyframe. */
  const keep = useCallback(async (version: Version | null = latestRef.current) => {
    if (!version) return;
    const frames = keyframesRef.current;
    const last = frames.at(-1);
    let difference: StateChange[] = [];
    if (last) {
      if (last.state.toSpec().mark !== version.state.toSpec().mark) {
        setNotice('Keyframes share one chart type. Clear them to start another.');
        return;
      }
      const result = await compare(last.state, version.state);
      if (unchanged(result)) {
        setNotice(`This is already keyframe ${frames.length}.`);
        return;
      }
      difference = result.stateChanges;
    }
    keyframesRef.current = [...frames, { ...version, id: nextKey.current++, changes: difference }];
    setKeyframes(keyframesRef.current);
    setNotice('');
  }, []);

  const clearKeyframes = useCallback(() => {
    goLive();
    keyframesRef.current = [];
    setKeyframes([]);
    setNotice('');
  }, [goLive]);

  /** Code, Δ and the live hand-off follow the replay playhead. */
  const follow = useCallback(
    (position: number) => {
      const frames = keyframesRef.current;
      setValue(position);
      const nearest = Math.min(frames.length - 1, Math.max(0, Math.round(position)));
      const leg = Math.min(frames.length - 1, Math.max(1, Math.ceil(position - 1e-6)));
      setChanges(frames[leg]?.changes ?? []);
      if (nearest === shownKey.current) return;
      shownKey.current = nearest;
      const keyframe = frames[nearest];
      shownRef.current = keyframe;
      latestRef.current = keyframe;
      writeCode(keyframe.code);
      setMarked(changedLines(frames[nearest - 1]?.code, keyframe.code));
      setError(null);
    },
    [writeCode],
  );

  /** Show the kept keyframes as one sequence, starting at `position`. */
  const replay = useCallback(
    async (position: number) => {
      const frames = keyframesRef.current;
      if (frames.length < 2) return null;
      const display = displayRef.current;
      if (display?.kind === 'replay' && replayOf.current === frames) return display.controller;
      storyRun.current += 1;
      setWriting(false);
      evalRun.current += 1;
      if (editTimer.current !== null) window.clearTimeout(editTimer.current);
      await queueRef.current.running;
      const { sequence } = await loadRuntime();
      const next = await mount((layer) => sequence(frames.map((frame) => frame.state) as never, { target: layer, height: HEIGHT }));
      if (keyframesRef.current !== frames) {
        next.controller.destroy();
        next.layer.remove();
        return null;
      }
      replayOf.current = frames;
      shownKey.current = -1;
      // Seamless when the chart already shows that keyframe; otherwise a cross-fade.
      const seamless = Number.isInteger(position) && shownRef.current === frames[position];
      show(next, 'replay', position, !seamless);
      setReplaying(true);
      follow(position);
      return next.controller;
    },
    [follow, mount, show],
  );

  const onScrub = useCallback(
    async (position: number) => {
      replayRun.current += 1;
      setPlaying(false);
      const controller = await replay(position);
      if (!controller) return;
      controller.progress(position);
      follow(position);
    },
    [follow, replay],
  );

  /** Where a replay starts: the playhead, or the keyframe the live chart shows. */
  const entry = useCallback(() => {
    const frames = keyframesRef.current;
    if (replaying) return value;
    const index = frames.findIndex((frame) => frame === shownRef.current);
    return index >= 0 ? index : frames.length - 1;
  }, [replaying, value]);

  /** Play the replay from `from` (default: where it is) to `to`. */
  const playTo = useCallback(
    async (to: number, from = entry()) => {
      const token = ++replayRun.current;
      const controller = await replay(from);
      if (!controller || token !== replayRun.current) return;
      const start = from;
      if (prefersReducedMotion()) {
        controller.progress(to);
        follow(to);
        return;
      }
      setPlaying(true);
      controller.play({ from: start, to, duration: LEG_DURATION });
      await settle(controller, to, (position) => token === replayRun.current && follow(position));
      if (token === replayRun.current) setPlaying(false);
    },
    [entry, follow, replay, settle],
  );

  const onPlay = useCallback(() => {
    const last = keyframesRef.current.length - 1;
    if (playing) {
      replayRun.current += 1;
      displayRef.current?.controller.pause();
      setPlaying(false);
      return;
    }
    const start = !replaying || value >= last - 1e-3 ? 0 : value;
    void playTo(last, start);
  }, [playTo, playing, replaying, value]);

  /** Type from the current code to `target`, the way a person edits. */
  const typeTo = useCallback(
    async (target: string, token: number) => {
      const current = codeRef.current;
      let start = 0;
      while (start < current.length && start < target.length && current[start] === target[start]) start += 1;
      let end = 0;
      while (end < current.length - start && end < target.length - start && current[current.length - 1 - end] === target[target.length - 1 - end]) end += 1;
      const head = current.slice(0, start);
      const tail = current.slice(current.length - end);
      const removed = current.slice(start, current.length - end);
      const added = target.slice(start, target.length - end);
      for (let length = removed.length - 1; length >= 0; length -= 1) {
        const text = head + removed.slice(0, length) + tail;
        writeCode(text);
        setMarked([lineAt(text, start + length)]);
        await sleep(DELETE_DELAY);
        if (token !== storyRun.current) return false;
      }
      for (let length = 1; length <= added.length; length += 1) {
        // Indentation arrives in one keystroke, as an editor would insert it.
        while (length < added.length && added[length - 1] === '\n' && added[length] === ' ') length += 1;
        while (length < added.length && added[length - 1] === ' ' && added[length] === ' ') length += 1;
        const text = head + added.slice(0, length) + tail;
        writeCode(text);
        setMarked([lineAt(text, start + length)]);
        await sleep(TYPE_DELAY);
        if (token !== storyRun.current) return false;
      }
      return true;
    },
    [writeCode],
  );

  /** Open a story: draw its code, then write each edit, keeping every state. */
  const open = useCallback(
    async (next: Opened) => {
      const token = ++storyRun.current;
      evalRun.current += 1;
      if (editTimer.current !== null) window.clearTimeout(editTimer.current);
      goLive();
      setStory(next);
      setError(null);
      setNotice('');
      setShowRows(false);
      setChanges([]);
      setMarked([]);
      setBusy(true);
      keyframesRef.current = [];
      setKeyframes([]);
      const frames = storyFrames(next);
      writeCode(frames[0]);
      try {
        const rows = next.data ? await loadCsv(next.data) : [];
        if (token !== storyRun.current) return;
        datasetRef.current = { name: datasetName(next.data), rows };
        setDataset(datasetRef.current);
        if (prefersReducedMotion()) {
          for (const frame of frames) {
            const version = { state: await evaluate(frame), code: frame };
            if (token !== storyRun.current) return;
            latestRef.current = version;
            await keep(version);
          }
          writeCode(frames.at(-1)!);
          await present(latestRef.current!);
          return;
        }
        const first = { state: await evaluate(frames[0]), code: frames[0] };
        if (token !== storyRun.current) return;
        latestRef.current = first;
        await present(first);
        await keep(first);
        setBusy(false);
        for (const frame of frames.slice(1)) {
          await sleep(STEP_PAUSE);
          if (token !== storyRun.current) return;
          setWriting(true);
          if (!(await typeTo(frame, token))) return;
          setWriting(false);
          const version = { state: await evaluate(frame), code: frame };
          if (token !== storyRun.current) return;
          latestRef.current = version;
          await present(version);
          if (token !== storyRun.current) return;
          await keep(version);
        }
      } catch (cause) {
        if (token === storyRun.current) setError(errorMessage(cause));
      } finally {
        if (token === storyRun.current) {
          setBusy(false);
          setWriting(false);
        }
      }
    },
    [evaluate, goLive, keep, present, typeTo, writeCode],
  );

  // Route: #sort, #zip … or #idiom=<gallery idiom id>.
  useEffect(() => {
    const route = async () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash.startsWith('idiom=')) {
        const { idioms } = await loadIdioms();
        const idiom = idioms.find((item) => item.id === hash.slice(6));
        if (idiom) {
          return void open({
            id: hash,
            title: idiom.title,
            chart: idiom.mark,
            line: 'From the gallery. Change any line; every valid edit animates.',
            data: idiom.data,
            code: idiom.code,
            edits: [],
          });
        }
      }
      void open(playgroundDemos.find((item) => item.id === hash) ?? playgroundDemos.find((item) => item.id === DEFAULT_STORY)!);
    };
    void route();
    window.addEventListener('hashchange', route);
    // Charts read theme tokens when they draw; redraw on a theme switch.
    const theme = new MutationObserver(() => displayRef.current?.controller.resize());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const runs = { story: storyRun, evaluation: evalRun, replay: replayRun };
    return () => {
      window.removeEventListener('hashchange', route);
      theme.disconnect();
      runs.story.current += 1;
      runs.evaluation.current += 1;
      runs.replay.current += 1;
      if (editTimer.current !== null) window.clearTimeout(editTimer.current);
      displayRef.current?.controller.destroy();
      displayRef.current = null;
    };
  }, [open]);

  const select = (next: Opened) => {
    window.history.replaceState(null, '', `#${next.id}`);
    void open(next);
  };

  const replaceRows = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const d3 = await loadD3();
      const rows = /\.json$/i.test(file.name) ? JSON.parse(text) : d3.csvParse(text, d3.autoType);
      if (!Array.isArray(rows) || !rows.length) throw new Error('Use a non-empty CSV table or a JSON array of rows.');
      storyRun.current += 1;
      setWriting(false);
      datasetRef.current = { name: file.name, rows: rows as Rows };
      setDataset(datasetRef.current);
      await run(codeRef.current);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const columns = useMemo(() => [...new Set(dataset.rows.slice(0, 50).flatMap((row) => Object.keys(row)))], [dataset]);

  return (
    <div>
      <nav aria-label="Kinds of change" className="flex flex-wrap gap-x-5 gap-y-2 border-b pb-3">
        {categories.map((category) => {
          const active = story?.category === category.id;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={active}
              title={category.summary}
              onClick={() => select(playgroundDemos.find((item) => item.category === category.id)!)}
              className={cn(
                'relative flex items-center gap-1.5 pb-1 text-[0.95rem] transition-colors',
                active ? 'text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground',
              )}
            >
              <StateChangeIcon category={category.id} className="size-3.5" />
              {category.label}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-0 -bottom-[3px] h-px bg-fd-foreground transition-transform duration-300 ease-out-quint md:-bottom-[13px]',
                  active ? 'scale-x-100' : 'scale-x-0',
                )}
              />
            </button>
          );
        })}
      </nav>
      {story?.category && (
        <nav aria-label="Stories" className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {playgroundDemos
            .filter((item) => item.category === story.category)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={story.id === item.id}
                onClick={() => select(item)}
                className={cn(
                  'font-mono text-sm transition-colors',
                  story.id === item.id ? 'text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground',
                )}
              >
                {item.title}
              </button>
            ))}
        </nav>
      )}
      <p className="mt-3 min-h-6 text-fd-muted-foreground">
        {story?.line}
        {story && <span className="vd-label ml-3">{story.chart}</span>}
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0">
          <div className="text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-fd-muted-foreground">
              <span className="vd-label">rows</span>
              <span className="font-mono text-xs">
                {dataset.name} · {dataset.rows.length} records
              </span>
              {dataset.rows.length > 0 && (
                <button type="button" className="text-xs underline-offset-4 hover:text-fd-foreground hover:underline" onClick={() => setShowRows((shown) => !shown)}>
                  {showRows ? 'hide' : 'view'}
                </button>
              )}
              <label className="cursor-pointer text-xs underline-offset-4 hover:text-fd-foreground hover:underline">
                use your own
                <input type="file" accept=".csv,.json" className="sr-only" aria-label="Use your own CSV or JSON rows" onChange={(event) => void replaceRows(event.currentTarget)} />
              </label>
              {story && (
                <button type="button" className="ml-auto text-xs underline-offset-4 hover:text-fd-foreground hover:underline" onClick={() => void open(story)}>
                  start over
                </button>
              )}
            </div>
            {showRows && (
              <div className="mt-2 max-h-64 overflow-auto rounded-md border">
                <table className="w-full whitespace-nowrap text-left font-mono text-[0.7rem] tabular-nums">
                  <thead className="sticky top-0 bg-fd-background">
                    <tr>
                      {columns.map((field) => (
                        <th key={field} className="px-3 py-2 font-medium text-fd-muted-foreground">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.rows.slice(0, 200).map((row, index) => (
                      <tr key={index} className="border-t">
                        {columns.map((field) => (
                          <td key={field} className="px-3 py-1.5">
                            {row[field] instanceof Date ? (row[field] as Date).toISOString().slice(0, 10) : String(row[field] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={cn('vd-code-surface mt-4 overflow-hidden rounded-md transition-shadow', error && 'shadow-[inset_2px_0_0_var(--color-fd-error)]')}>
            <CodeEditor value={code} onChange={onEdit} onRun={runNow} onSave={() => void keep()} markedLines={marked} ariaLabel="Chart code" />
          </div>
          {error ? (
            <p role="alert" className="mt-1.5 font-mono text-xs text-fd-error">
              {error}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-fd-muted-foreground">
              <span className="sr-only" aria-live="polite">
                {writing ? 'The story is editing the code.' : ''}
              </span>
              Every valid edit animates · <kbd className="font-mono">⌘S</kbd> keeps a keyframe · code runs in your browser
            </p>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div ref={stageRef} className="pg-stage vd-docs-chart" style={{ minHeight: HEIGHT }} aria-label="Chart" aria-busy={busy} />
          <p className="mt-1.5 flex min-h-5 flex-wrap items-baseline gap-x-2.5 gap-y-1 font-mono text-xs text-fd-muted-foreground" aria-live="polite">
            <span className="font-sans font-semibold text-[var(--color-delta)]">Δ</span>
            {changes.length ? changes.map((change, index) => <span key={index} className="text-fd-foreground/80">{formatChange(change)}</span>) : <span>edit the code; the chart follows</span>}
          </p>
          <Timeline
            keyframes={keyframes}
            value={value}
            replaying={replaying}
            playing={playing}
            onScrub={(position) => void onScrub(position)}
            onSeek={(index) => void playTo(index)}
            onPlay={onPlay}
            onKeep={() => void keep()}
            onClear={clearKeyframes}
            canKeep={!busy && !error}
            notice={notice}
          />
        </div>
      </div>
    </div>
  );
}
