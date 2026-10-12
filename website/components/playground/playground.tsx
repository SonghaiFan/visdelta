'use client';

import { Link2, PanelLeft, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { DeltaResult, StateChange } from 'visdelta/core';
import type { VisualizationSequence, VisualizationTransition } from 'visdelta/transition';
import { CodeEditor, type CodeHints } from '@/components/interactive/code-editor';
import { loadIdioms, type LabChart } from '@/components/interactive/corpus';
import {
  errorMessage,
  evaluateChart,
  loadFactories,
  loadRuntime,
  prefersReducedMotion,
  type ChartName,
  type ChartState,
} from '@/components/interactive/runtime';
import { formatChange } from '@/components/live/transition-player';
import { categories } from '@/examples/registry';
import { cn } from '@/lib/cn';
import { datasetName, decodeShare, encodeShare, formatOf, inlineData, loadText, parseRows, type Dataset, type SharedCode } from './data';
import { playgroundDemos, storyFrames, type PlaygroundDemo as Story } from './demos';
import { Explorer } from './explorer';
import { useMedia, useModifierKey, usePreference } from './preferences';
import { RowsPanel, type RowsView } from './rows-panel';
import { Timeline } from './timeline';

/** A curated story, gallery code, or code from a share link (no category). */
type Opened = Omit<Story, 'category'> & {
  category?: Story['category'];
  /** Where uncategorized code came from. */
  origin?: 'Gallery' | 'Link';
  /** Rows carried by a share link. */
  rows?: SharedCode['rows'];
  /** Code from a link runs only when the reader presses Run. */
  review?: boolean;
};

const CHARTS: ChartName[] = ['bar', 'line', 'area', 'point', 'unit'];
/** One route stage of a live edit. */
const EDIT_DURATION = 750;
/** One route stage between kept keyframes; a leg plays its stage count × this. */
const STAGE_DURATION = 900;
/** Quiet time after a keystroke before the code runs. */
const SETTLE = 280;
const TYPE_DELAY = 24;
const DELETE_DELAY = 12;
/** Hold between a story's edits. */
const STEP_PAUSE = 1100;
const DEFAULT_STORY = 'sort';
/** Editor share of the editor + preview width. */
const DEFAULT_SPLIT = 0.42;
const SPLIT_RANGE = [0.25, 0.72] as const;
/** Builder members that are not chainable authoring calls. */
const INTERNAL_MEMBERS = new Set(['constructor', 'state', 'chartModule', 'compileSpec', 'toSpec', 'rows', 'replaceState', 'derive']);
const STORAGE = { split: 'visdelta.playground.split', autoRun: 'visdelta.playground.autorun' };

type Controller = VisualizationTransition | VisualizationSequence;
interface Version {
  state: ChartState;
  code: string;
}
interface Keyframe extends Version {
  id: number;
  changes: StateChange[];
  /** Route stages VisDelta plans for the leg into this keyframe; 0 for the first. */
  stages: number;
}
interface Display {
  layer: HTMLElement;
  controller: Controller;
  kind: 'live' | 'replay';
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const lineAt = (text: string, offset: number) => text.slice(0, offset).split('\n').length;
const clamp = (value: number, [low, high]: readonly [number, number]) => Math.min(high, Math.max(low, value));
const chartOf = (code: string): LabChart => (code.match(/\b(bar|line|area|point|unit)\s*\(/)?.[1] as LabChart) ?? 'bar';

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
 * An online editor for VisDelta. Every valid edit is a transition from the
 * chart on screen to the new code. Keep any moment as a keyframe; kept
 * keyframes replay as one continuous `sequence()` on the timeline.
 */
export function Playground() {
  const appRef = useRef<HTMLDivElement>(null);
  const editorPaneRef = useRef<HTMLElement>(null);
  const previewPaneRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const factoriesRef = useRef<Awaited<ReturnType<typeof loadFactories>> | null>(null);
  const membersRef = useRef(new Map<ChartName, string[]>());
  const displayRef = useRef<Display | null>(null);
  /** The state on screen, or the one the live motion is heading to. */
  const shownRef = useRef<Version | null>(null);
  /** The last version of the code that ran. */
  const latestRef = useRef<Version | null>(null);
  const keyframesRef = useRef<Keyframe[]>([]);
  const replayOf = useRef<Keyframe[] | null>(null);
  const datasetRef = useRef<Dataset>(inlineData);
  const codeRef = useRef('');
  const queueRef = useRef<{ running: Promise<void> | null; pending: Version | null }>({ running: null, pending: null });
  const storyRun = useRef(0);
  const evalRun = useRef(0);
  const replayRun = useRef(0);
  const editTimer = useRef<number | null>(null);
  const rowsTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const nextKey = useRef(1);
  const shownKey = useRef(-1);
  const reviewRef = useRef(false);
  /** The last live edit and the route stages it was planned with. */
  const lastMoveRef = useRef<{ from: ChartState; to: ChartState; stages: number } | null>(null);

  const [story, setStory] = useState<Opened | null>(null);
  const [code, setCode] = useState('');
  const [ranCode, setRanCode] = useState('');
  const [marked, setMarked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset>(inlineData);
  const [tab, setTab] = useState<'code' | 'rows'>('code');
  const [rowsView, setRowsView] = useState<RowsView>('table');
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [replaying, setReplaying] = useState(false);
  const [value, setValue] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [changes, setChanges] = useState<StateChange[]>([]);
  /** Route stages of the motion the Δ line describes. */
  const [changeStages, setChangeStages] = useState(0);
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [review, setReview] = useState(false);
  const [autoRunPreference, setAutoRunPreference] = usePreference(STORAGE.autoRun, 'true');
  const [splitPreference, setSplitPreference] = usePreference(STORAGE.split, String(DEFAULT_SPLIT));
  /** The divider while it is being dragged. */
  const [dragSplit, setDragSplit] = useState<number | null>(null);
  /** null follows the layout: open on wide screens, closed on narrow ones. */
  const [explorerChoice, setExplorerChoice] = useState<boolean | null>(null);
  const wide = useMedia('(min-width: 1024px)', true);
  const mod = useModifierKey();
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [flash, setFlash] = useState('');

  const autoRun = autoRunPreference !== 'false';
  const autoRunRef = useRef(autoRun);
  useEffect(() => {
    autoRunRef.current = autoRun;
  }, [autoRun]);
  const split = dragSplit ?? clamp(Number(splitPreference) || DEFAULT_SPLIT, SPLIT_RANGE);
  const dragging = dragSplit !== null;
  const explorerOpen = explorerChoice ?? wide;

  const writeCode = useCallback((text: string) => {
    codeRef.current = text;
    setCode(text);
  }, []);

  const setLatest = useCallback((version: Version) => {
    latestRef.current = version;
    setRanCode(version.code);
  }, []);

  const say = useCallback((text: string) => {
    setFlash(text);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(''), 3200);
  }, []);

  /** The chart's height follows its pane. */
  const stageHeight = useCallback(() => Math.max(220, Math.floor(stageRef.current?.clientHeight || 400)), []);

  /** Build a controller in a hidden layer of the stage. */
  const mount = useCallback(async <C extends Controller>(build: (target: HTMLElement) => Promise<C>) => {
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

  /** Remove the chart on screen, as for code that has not run yet. */
  const clearStage = useCallback(() => {
    const display = displayRef.current;
    displayRef.current = null;
    shownRef.current = null;
    latestRef.current = null;
    setRanCode('');
    if (!display) return;
    display.controller.destroy();
    display.layer.remove();
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
      const options = (layer: HTMLElement) => ({ target: layer, height: stageHeight() });
      if (from && displayRef.current && from.state.toSpec().mark === target.state.toSpec().mark) {
        const difference = await compare(from.state, target.state);
        if (unchanged(difference)) {
          shownRef.current = target;
          return;
        }
        try {
          const next = await mount((layer) => transition(from.state as never, target.state as never, options(layer)));
          const stages = next.controller.stageCount();
          lastMoveRef.current = { from: from.state, to: target.state, stages };
          shownRef.current = target;
          setChanges(difference.stateChanges);
          setChangeStages(stages);
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
      if (!from || from.state.toSpec().mark !== target.state.toSpec().mark) {
        setChanges([]);
        setChangeStages(0);
      }
      show(next, 'live', 0, true);
    },
    [mount, settle, show, stageHeight],
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

  /**
   * How many serial route stages VisDelta plans between two states: the live
   * edit's own count when it was this pair, otherwise an offscreen transition.
   */
  const measureStages = useCallback(async (from: ChartState, to: ChartState) => {
    const move = lastMoveRef.current;
    if (move && move.from === from && move.to === to) return move.stages;
    const { transition } = await loadRuntime();
    const host = document.createElement('div');
    host.className = 'pg-measure vd-docs-chart';
    document.body.append(host);
    try {
      const controller = await transition(from as never, to as never, { target: host, height: 240 });
      const stages = controller.stageCount();
      controller.destroy();
      return stages;
    } catch {
      return 1; // No route: the replay reports the failure when it is built.
    } finally {
      host.remove();
    }
  }, []);

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
    const stages = last ? await measureStages(last.state, version.state) : 0;
    if (keyframesRef.current !== frames) return; // cleared or kept meanwhile
    keyframesRef.current = [...frames, { ...version, id: nextKey.current++, changes: difference, stages }];
    setKeyframes(keyframesRef.current);
    setNotice('');
  }, [measureStages]);

  /** Run code; if it is a valid state, the chart moves to it. */
  const run = useCallback(
    async (source: string) => {
      const request = ++evalRun.current;
      try {
        const state = await evaluate(source);
        if (request !== evalRun.current) return;
        setError(null);
        const version = { state, code: source };
        setLatest(version);
        goLive();
        const first = reviewRef.current;
        reviewRef.current = false;
        setReview(false);
        await present(version);
        if (first && request === evalRun.current) await keep(version);
      } catch (cause) {
        if (request === evalRun.current) setError(errorMessage(cause));
      }
    },
    [evaluate, goLive, keep, present, setLatest],
  );

  const onEdit = useCallback(
    (text: string) => {
      storyRun.current += 1; // the reader takes over from a story
      setWriting(false);
      setNotice('');
      writeCode(text);
      if (editTimer.current !== null) window.clearTimeout(editTimer.current);
      if (autoRunRef.current && !reviewRef.current) editTimer.current = window.setTimeout(() => void run(text), SETTLE);
    },
    [run, writeCode],
  );

  const runNow = useCallback(() => {
    storyRun.current += 1;
    setWriting(false);
    if (editTimer.current !== null) window.clearTimeout(editTimer.current);
    void run(codeRef.current);
  }, [run]);

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
      setChangeStages(frames[leg]?.stages ?? 0);
      if (nearest === shownKey.current) return;
      shownKey.current = nearest;
      const keyframe = frames[nearest];
      shownRef.current = keyframe;
      setLatest(keyframe);
      writeCode(keyframe.code);
      setMarked(changedLines(frames[nearest - 1]?.code, keyframe.code));
      setError(null);
    },
    [setLatest, writeCode],
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
      const next = await mount((layer) => sequence(frames.map((frame) => frame.state) as never, { target: layer, height: stageHeight() }));
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
    [follow, mount, show, stageHeight],
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
      controller.play({ from: start, to, duration: STAGE_DURATION });
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

  /** The rows a story, idiom or link declares. */
  const loadDataset = useCallback(async (next: Opened): Promise<Dataset> => {
    if (next.rows) return { ...next.rows, rows: await parseRows(next.rows.text, next.rows.format) };
    if (!next.data) return inlineData;
    const text = await loadText(next.data);
    return { name: datasetName(next.data), format: 'csv', text, rows: await parseRows(text, 'csv'), source: next.data };
  }, []);

  /** Open a story: draw its code, then write each edit, keeping every state. */
  const open = useCallback(
    async (next: Opened) => {
      const token = ++storyRun.current;
      evalRun.current += 1;
      if (editTimer.current !== null) window.clearTimeout(editTimer.current);
      if (rowsTimer.current !== null) window.clearTimeout(rowsTimer.current);
      goLive();
      setStory(next);
      setError(null);
      setNotice('');
      setTab('code');
      setChanges([]);
      setMarked([]);
      setBusy(true);
      reviewRef.current = Boolean(next.review);
      setReview(Boolean(next.review));
      keyframesRef.current = [];
      setKeyframes([]);
      const frames = storyFrames(next);
      writeCode(frames[0]);
      try {
        const rows = await loadDataset(next);
        if (token !== storyRun.current) return;
        datasetRef.current = rows;
        setDataset(rows);
        if (next.review) {
          clearStage();
          return;
        }
        if (prefersReducedMotion()) {
          for (const frame of frames) {
            const version = { state: await evaluate(frame), code: frame };
            if (token !== storyRun.current) return;
            setLatest(version);
            await keep(version);
          }
          writeCode(frames.at(-1)!);
          await present(latestRef.current!);
          return;
        }
        const first = { state: await evaluate(frames[0]), code: frames[0] };
        if (token !== storyRun.current) return;
        setLatest(first);
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
          setLatest(version);
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
    [clearStage, evaluate, goLive, keep, loadDataset, present, setLatest, typeTo, writeCode],
  );

  // Route: #sort, #zip …, #idiom=<gallery idiom id> or #share=<code>.
  useEffect(() => {
    const route = async () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash.startsWith('share=')) {
        try {
          const shared = await decodeShare(hash.slice(6));
          return void open({
            id: 'shared',
            title: 'Shared code',
            origin: 'Link',
            chart: shared.chart && CHARTS.includes(shared.chart) ? (shared.chart as LabChart) : chartOf(shared.code),
            line: 'Opened from a link. Read the code, then run it.',
            data: shared.data,
            rows: shared.rows,
            code: shared.code,
            edits: [],
            review: true,
          });
        } catch (cause) {
          await open(playgroundDemos.find((item) => item.id === DEFAULT_STORY)!);
          return setError(errorMessage(cause));
        }
      }
      if (hash.startsWith('idiom=')) {
        const { idioms } = await loadIdioms();
        const idiom = idioms.find((item) => item.id === hash.slice(6));
        if (idiom) {
          return void open({
            id: hash,
            title: idiom.title,
            origin: 'Gallery',
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
    const timers = [editTimer, rowsTimer, flashTimer];
    return () => {
      window.removeEventListener('hashchange', route);
      theme.disconnect();
      runs.story.current += 1;
      runs.evaluation.current += 1;
      runs.replay.current += 1;
      for (const timer of timers) if (timer.current !== null) window.clearTimeout(timer.current);
      displayRef.current?.controller.destroy();
      displayRef.current = null;
    };
  }, [open]);

  // The chart follows its pane: width and height come from the layout.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    let size = '';
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = `${stage.clientWidth}x${stage.clientHeight}`;
        if (next === size) return;
        const first = !size;
        size = next;
        const display = displayRef.current;
        if (first || !display) return;
        if (display.kind === 'live') (display.controller as VisualizationTransition).resize({ height: stageHeight() });
        else display.controller.resize();
      });
    });
    observer.observe(stage);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [stageHeight]);

  // A narrow layout shows the examples as a drawer; Escape closes it.
  useEffect(() => {
    if (wide || !explorerOpen) return;
    const close = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && setExplorerChoice(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [explorerOpen, wide]);

  const select = (next: Opened) => {
    window.history.replaceState(null, '', `#${next.id}`);
    if (!wide) setExplorerChoice(false);
    void open(next);
  };

  const toggleAutoRun = (on: boolean) => {
    autoRunRef.current = on;
    setAutoRunPreference(String(on));
    if (on && codeRef.current !== latestRef.current?.code && !reviewRef.current) runNow();
  };

  /** New rows: rerun the code on screen against them. */
  const applyRows = useCallback(
    async (next: Dataset) => {
      storyRun.current += 1;
      setWriting(false);
      datasetRef.current = next;
      setDataset(next);
      if (!reviewRef.current) await run(codeRef.current);
    },
    [run],
  );

  const replaceRows = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const format = formatOf(file.name);
      const rows = await parseRows(text, format);
      if (!rows.length) throw new Error('Use a non-empty CSV table or a JSON array of rows.');
      await applyRows({ name: file.name, format, text, rows });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const onRowsEdit = useCallback(
    (text: string) => {
      const edited: Dataset = { ...datasetRef.current, text, source: undefined };
      datasetRef.current = edited;
      if (rowsTimer.current !== null) window.clearTimeout(rowsTimer.current);
      rowsTimer.current = window.setTimeout(async () => {
        try {
          const rows = await parseRows(text, edited.format);
          if (datasetRef.current.text !== text) return;
          const next = { ...datasetRef.current, rows };
          if (autoRunRef.current) await applyRows(next);
          else {
            datasetRef.current = next;
            setDataset(next);
          }
        } catch (cause) {
          setError(`Rows: ${errorMessage(cause)}`);
        }
      }, SETTLE);
    },
    [applyRows],
  );

  /** Put the code and its rows in the URL and copy it. */
  const share = async () => {
    const current = datasetRef.current;
    const payload: SharedCode = { code: codeRef.current, chart: chartOf(codeRef.current) };
    if (current.source) payload.data = current.source;
    else if (current.text) payload.rows = { name: current.name, format: current.format, text: current.text };
    try {
      const { hash, rowsOmitted } = await encodeShare(payload);
      window.history.replaceState(null, '', `#${hash}`);
      let copied = false;
      try {
        await navigator.clipboard.writeText(window.location.href);
        copied = true;
      } catch {
        // No clipboard access: the link is in the address bar.
      }
      say(rowsOmitted ? 'Link ready, without your rows: they are too large for a URL' : copied ? 'Link copied' : 'Link is in the address bar');
    } catch (cause) {
      say(`Could not make a link: ${errorMessage(cause)}`);
    }
  };

  const hints = useMemo<CodeHints>(
    () => ({
      members() {
        const chart = chartOf(codeRef.current);
        const factory = factoriesRef.current?.[chart];
        if (!factory) return [];
        let names = membersRef.current.get(chart);
        if (!names) {
          const found = new Set<string>();
          for (let proto = Object.getPrototypeOf(factory([])); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
            for (const name of Object.getOwnPropertyNames(proto)) {
              if (!INTERNAL_MEMBERS.has(name) && typeof proto[name] === 'function') found.add(name);
            }
          }
          names = [...found].sort();
          membersRef.current.set(chart, names);
        }
        return names;
      },
      strings: () => [...new Set(datasetRef.current.rows.slice(0, 50).flatMap((row) => Object.keys(row)))],
      names: () => ['chart', 'rows', 'd3', ...CHARTS],
    }),
    [],
  );

  const onCursor = useCallback((line: number, column: number) => setCursor({ line, column }), []);

  /** Drag the divider between the editor and the preview. */
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const editor = editorPaneRef.current?.getBoundingClientRect();
    const preview = previewPaneRef.current?.getBoundingClientRect();
    if (!editor || !preview) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const width = preview.right - editor.left - handle.offsetWidth;
    let current = split;
    setDragSplit(current);
    const move = (moveEvent: globalThis.PointerEvent) => {
      current = clamp((moveEvent.clientX - editor.left) / width, SPLIT_RANGE);
      setDragSplit(current);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      setSplitPreference(current.toFixed(3));
      setDragSplit(null);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };
  const nudgeSplit = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -0.02, ArrowRight: 0.02 }[event.key];
    const jump = { Home: SPLIT_RANGE[0], End: SPLIT_RANGE[1] }[event.key];
    if (step === undefined && jump === undefined) return;
    event.preventDefault();
    setSplitPreference((jump ?? clamp(split + step!, SPLIT_RANGE)).toFixed(3));
  };

  const group = story?.category ? categories.find((category) => category.id === story.category)?.label : story?.origin;
  const dirty = !review && !autoRun && code !== ranCode;
  const status = error
    ? { tone: 'error', text: 'Error' }
    : review
      ? { tone: 'idle', text: 'Not run yet' }
      : busy
        ? { tone: 'busy', text: 'Loading' }
        : writing
          ? { tone: 'busy', text: 'Story is editing the code' }
          : replaying
            ? { tone: 'live', text: playing ? 'Replaying keyframes' : 'On the timeline' }
            : dirty
              ? { tone: 'idle', text: `Edited · ${mod}↵ to run` }
              : { tone: 'live', text: 'Live' };

  return (
    <div
      ref={appRef}
      className="pg-app"
      // "auto" lets the layout decide until the reader toggles the examples.
      data-explorer={explorerChoice === null ? 'auto' : explorerOpen ? 'open' : 'closed'}
      data-dragging={dragging || undefined}
      style={{ '--pg-left': `${split * 100}fr`, '--pg-right': `${(1 - split) * 100}fr` } as CSSProperties}
    >
      <div role="toolbar" aria-label="Playground" className="pg-toolbar">
        <h1 className="sr-only">Playground</h1>
        <button
          type="button"
          className="pg-tool"
          aria-label={explorerOpen ? 'Hide examples' : 'Show examples'}
          aria-expanded={explorerOpen}
          aria-controls="pg-explorer"
          title="Examples"
          onClick={() => setExplorerChoice(!explorerOpen)}
        >
          <PanelLeft className="size-4" />
        </button>
        <p className="flex min-w-0 items-baseline gap-1.5 truncate text-sm">
          {group && <span className="text-fd-muted-foreground">{group}</span>}
          {group && (
            <span aria-hidden="true" className="text-fd-muted-foreground/60">
              /
            </span>
          )}
          <span className="truncate font-medium">{story?.title}</span>
          {story && <span className="vd-label ml-1.5">{story.chart}</span>}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <label className="pg-switch" title="Run the code shortly after each edit">
            <input type="checkbox" role="switch" checked={autoRun} onChange={(event) => toggleAutoRun(event.currentTarget.checked)} />
            <span aria-hidden="true" className="pg-switch-track" />
            <span className="hidden sm:inline">Auto-run</span>
            <span className="sr-only sm:hidden">Auto-run</span>
          </label>
          <button type="button" className="pg-tool pg-tool-primary" onClick={runNow} title={`Run (${mod}↵)`}>
            <Play aria-hidden="true" className="size-3.5" />
            <span>Run</span>
          </button>
          <button type="button" className="pg-tool" onClick={() => story && void open(story)} disabled={!story} title="Open this example again from the start">
            <RotateCcw aria-hidden="true" className="size-3.5" />
            <span className="hidden md:inline">Reset</span>
            <span className="sr-only md:hidden">Reset</span>
          </button>
          <button type="button" className="pg-tool" onClick={() => void share()} title="Copy a link to this code">
            <Link2 aria-hidden="true" className="size-3.5" />
            <span className="hidden md:inline">Share</span>
            <span className="sr-only md:hidden">Share</span>
          </button>
        </div>
      </div>

      <aside id="pg-explorer" className="pg-explorer">
        <Explorer stories={playgroundDemos} activeId={story?.id} activeCategory={story?.category} onOpen={select} />
      </aside>
      <button type="button" className="pg-backdrop" aria-label="Close examples" tabIndex={-1} onClick={() => setExplorerChoice(false)} />

      <section ref={editorPaneRef} aria-label="Editor" className="pg-editor vd-code-surface">
        <div role="tablist" aria-label="Files" className="pg-tabs">
          <button
            type="button"
            role="tab"
            id="pg-tab-rows"
            aria-selected={tab === 'rows'}
            aria-controls="pg-panel-rows"
            className="pg-tab"
            onClick={() => setTab('rows')}
            title={`${dataset.name} · ${dataset.rows.length} records`}
          >
            <span className="max-w-[14rem] truncate">{dataset.name}</span>
            <span className="text-[var(--code-muted)] tabular-nums">{dataset.rows.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="pg-tab-code"
            aria-selected={tab === 'code'}
            aria-controls="pg-panel-code"
            className="pg-tab"
            onClick={() => setTab('code')}
          >
            chart.js
            {dirty && <span aria-label="not run" className="size-1.5 rounded-full bg-[var(--color-delta)]" />}
          </button>
        </div>
        <div role="tabpanel" id="pg-panel-code" aria-labelledby="pg-tab-code" hidden={tab !== 'code'} className="pg-panel">
          <CodeEditor
            className="h-full"
            value={code}
            onChange={onEdit}
            onRun={runNow}
            onSave={() => void keep()}
            onCursor={onCursor}
            markedLines={marked}
            hints={hints}
            lineNumbers
            ariaLabel="Chart code"
          />
        </div>
        {tab === 'rows' && (
          <div role="tabpanel" id="pg-panel-rows" aria-labelledby="pg-tab-rows" className="pg-panel">
            <RowsPanel dataset={dataset} view={rowsView} onView={setRowsView} onEdit={onRowsEdit} onUpload={(input) => void replaceRows(input)} onRun={runNow} />
          </div>
        )}
        {error && (
          <p role="alert" className="pg-problem">
            {error}
          </p>
        )}
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize editor and preview"
        aria-valuemin={Math.round(SPLIT_RANGE[0] * 100)}
        aria-valuemax={Math.round(SPLIT_RANGE[1] * 100)}
        aria-valuenow={Math.round(split * 100)}
        tabIndex={0}
        className="pg-splitter"
        onPointerDown={startDrag}
        onKeyDown={nudgeSplit}
        onDoubleClick={() => setSplitPreference(String(DEFAULT_SPLIT))}
      />

      <section ref={previewPaneRef} aria-label="Preview" className="pg-preview">
        <p className="min-h-9 shrink-0 px-4 pt-2.5 text-sm text-fd-muted-foreground">{story?.line}</p>
        <div className="relative min-h-0 flex-1 px-4">
          <div ref={stageRef} className="pg-stage vd-docs-chart" aria-label="Chart" aria-busy={busy} />
          {review && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div className="max-w-sm">
                <p className="text-sm text-fd-muted-foreground">
                  Code from a link runs in this page only when you ask. Read it in the editor, then run it.
                </p>
                <button type="button" className="pg-tool pg-tool-primary mx-auto mt-3" onClick={runNow}>
                  <Play aria-hidden="true" className="size-3.5" />
                  Run this code
                </button>
              </div>
            </div>
          )}
        </div>
        <p
          role="status"
          aria-label="State changes"
          className="flex min-h-7 shrink-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-1 font-mono text-xs text-fd-muted-foreground"
        >
          <span className="font-sans font-semibold text-[var(--color-delta)]">Δ</span>
          {changes.length ? changes.map((change, index) => <span key={index} className="text-fd-foreground/80">{formatChange(change)}</span>) : <span>edit the code; the chart follows</span>}
          {changes.length > 0 && changeStages > 1 && <span className="ml-auto font-sans">planned in {changeStages} stages</span>}
        </p>
      </section>

      <Timeline
        className="pg-timeline"
        keyframes={keyframes}
        value={value}
        stageDuration={STAGE_DURATION}
        replaying={replaying}
        playing={playing}
        onScrub={(position) => void onScrub(position)}
        onSeek={(index) => void playTo(index)}
        onPlay={onPlay}
        onKeep={() => void keep()}
        onClear={clearKeyframes}
        canKeep={!busy && !error && !review}
        notice={notice}
        mod={mod}
      />

      <footer className="pg-status">
        <span className="flex min-w-0 items-center gap-1.5" data-tone={status.tone}>
          <span aria-hidden="true" className="pg-status-dot" />
          <span className="truncate">{status.text}</span>
        </span>
        <span className="sr-only" aria-live="polite">
          {writing ? 'The story is editing the code.' : ''}
        </span>
        {flash && (
          <span role="status" className="truncate text-fd-foreground">
            {flash}
          </span>
        )}
        <span className="ml-auto hidden truncate sm:inline">
          rows · {dataset.name} · {dataset.rows.length}
        </span>
        <span className="hidden md:inline">
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span className="hidden lg:inline">
          {mod}↵ run · {mod}S keep · Ctrl+Space complete
        </span>
        <span className="ml-auto sm:ml-0">Runs in your browser</span>
      </footer>
    </div>
  );
}
