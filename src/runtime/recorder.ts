// Transition recorder.
//
// A recorder has the d3-transition authoring surface — attr, style, tween,
// delay, duration, ease, remove, chained transition() — but schedules nothing.
// Every call appends a tween factory to a TrackItem that the scene's progress
// controller samples at any progress value. Charts keep writing enter/update/
// exit code the D3 way; the runtime gets typed, timer-free tracks.
//
// Interpolation matches d3-transition's public behavior: `attr("transform")`
// uses interpolateTransformSvg, everything else uses interpolateValue, and start
// values are read from the DOM when the item initializes (not when recorded).

import type { BaseType, Selection } from 'd3-selection';
import type { Ease, TrackItem, Tween } from './tracks.js';
import { interpolate as interpolateValue, interpolateTransformSvg } from 'd3-interpolate';
import { namespace } from 'd3-selection';
import { now } from 'd3-timer';

type ValueFn<Datum, Result> = (this: Element, datum: Datum, index: number, group: Element[]) => Result;
type Value<Datum, Result> = Result | ValueFn<Datum, Result>;
type Interpolator = (t: number) => string | number;
type TweenFactory<Datum> = (this: Element, datum: Datum, index: number, group: Element[]) => ((this: Element, t: number) => void) | null | undefined;

export interface Timing {
  time: number;
  delay: number;
  duration: number;
  ease: Ease;
}

interface Entry<Datum> {
  node: Element;
  datum: Datum;
  index: number;
  group: Element[];
  timing: Timing;
  factories: Array<{ name: string; create: (entry: Entry<Datum>) => Tween['apply'] | null }>;
  remove: boolean;
  item: TrackItem;
}

/** Any scene object; recorded items are kept off the scene in a WeakMap. */
type SceneWithTracks = object;

/**
 * The authoring surface of a Recorder — the d3-transition method shape chart
 * code already knows, minus everything that only makes sense on a timer.
 */
export interface Motion<Element_ extends BaseType, Datum> {
  attr(name: string, value: Value<Datum, string | number | boolean | null>): this;
  attrTween(name: string, factory: (this: Element, datum: Datum, index: number, group: Element[]) => Interpolator | null | undefined): this;
  style(name: string, value: Value<Datum, string | number | null>, priority?: 'important' | null): this;
  styleTween(name: string, factory: (this: Element, datum: Datum, index: number, group: Element[]) => Interpolator | null | undefined, priority?: 'important' | null): this;
  tween(name: string, factory: TweenFactory<Datum>): this;
  text(value: Value<Datum, string | number | null>): this;
  remove(): this;
  delay(value: Value<Datum, number>): this;
  duration(value: Value<Datum, number>): this;
  ease(value: Ease): this;
  easeVarying(factory: ValueFn<Datum, Ease>): this;
  transition(): Motion<Element_, Datum>;
  call<Args extends unknown[]>(fn: (motion: this, ...args: Args) => unknown, ...args: Args): this;
  each(fn: ValueFn<Datum, void>): this;
  filter(predicate: string | ValueFn<Datum, boolean>): Motion<Element_, Datum>;
  selection(): Selection<Element_, Datum, any, any>;
  on(type: string, listener: unknown): this;
}

/**
 * The timing a chart hands to `motion()`: a plain, inert description. There is
 * no D3 Transition behind it, so nothing can be scheduled by accident and
 * nothing can be mutated after the fact — chart-specific easing is declared
 * where the timing is created (the transition plan), not patched on later.
 */
export interface MotionTiming {
  delay: number;
  duration: number;
  ease: Ease;
}

/** The mount element of a rendered scene carries the scene. */
interface SceneHost extends Node {
  __visDeltaScene?: SceneWithTracks;
}

/**
 * Record seekable motion for `selection` with `timing`. Every selection a
 * renderer touches lives under a VisDelta mount, whose scene supplies the track
 * sink; a selection outside any scene is a programming error and throws rather
 * than silently animating on D3's timer.
 */
export function motion<Element_ extends BaseType, Datum>(
  selection: Selection<Element_, Datum, any, any>,
  timing: MotionTiming
): Motion<Element_, Datum> {
  const node = selection.node() as Node | null;
  // An empty selection (nothing entered, nothing exited) records nothing.
  if (!node) return new Recorder(selection, [], { time: 0, ...timing });
  const scene = sceneOf(node);
  if (!scene) throw new Error('motion() needs a selection inside a mounted VisDelta chart.');
  return record(selection, recordedTracks(scene), { time: now(), ...timing });
}

function sceneOf(node: Node): SceneWithTracks | null {
  for (let current: Node | null = node; current; current = current.parentNode) {
    const scene = (current as SceneHost).__visDeltaScene;
    if (scene) return scene;
  }
  return null;
}

const pendingTracks = new WeakMap<SceneWithTracks, TrackItem[]>();

/** The array a scene accumulates recorded items in until the next controller drains it. */
export function recordedTracks(scene: SceneWithTracks): TrackItem[] {
  let items = pendingTracks.get(scene);
  if (!items) { items = []; pendingTracks.set(scene, items); }
  return items;
}

export function drainRecordedTracks(scene: SceneWithTracks): TrackItem[] {
  const items = pendingTracks.get(scene) ?? [];
  pendingTracks.delete(scene);
  return items;
}


export class Recorder<Element_ extends BaseType, Datum> implements Motion<Element_, Datum> {
  private readonly entries: Entry<Datum>[];

  constructor(
    private readonly source: Selection<Element_, Datum, any, any>,
    private readonly sink: TrackItem[],
    timing: Timing
  ) {
    const entries: Entry<Datum>[] = [];
    source.each(function (datum, index, group) {
      // d3 visits only non-null nodes; BaseType admits null/Window in the type only.
      const entry: Entry<Datum> = {
        node: this as unknown as Element,
        datum,
        index,
        group: Array.from(group as ArrayLike<Element>),
        timing: { ...timing },
        factories: [],
        remove: false,
        item: null as unknown as TrackItem
      };
      entry.item = createItem(entry);
      entries.push(entry);
    });
    this.entries = entries;
    for (const entry of entries) sink.push(entry.item);
  }

  /** The selection this recorder was created from. */
  selection(): Selection<Element_, Datum, any, any> {
    return this.source;
  }

  delay(): number;
  delay(value: Value<Datum, number>): this;
  delay(value?: Value<Datum, number>): number | this {
    if (value === undefined) return this.entries[0]?.timing.delay ?? 0;
    for (const entry of this.entries) entry.timing.delay = entry.item.delay = Number(resolve(entry, value)) || 0;
    return this;
  }

  duration(): number;
  duration(value: Value<Datum, number>): this;
  duration(value?: Value<Datum, number>): number | this {
    if (value === undefined) return this.entries[0]?.timing.duration ?? 0;
    for (const entry of this.entries) entry.timing.duration = entry.item.duration = Math.max(0, Number(resolve(entry, value)) || 0);
    return this;
  }

  ease(): Ease;
  ease(value: Ease): this;
  ease(value?: Ease): Ease | this {
    if (value === undefined) return this.entries[0]?.timing.ease ?? ((t) => t);
    if (typeof value !== 'function') throw new Error('ease must be a function.');
    for (const entry of this.entries) entry.timing.ease = entry.item.ease = value;
    return this;
  }

  /** Per-node ease. Like D3, the factory runs now, not at start. */
  easeVarying(factory: ValueFn<Datum, Ease>): this {
    if (typeof factory !== 'function') throw new Error('easeVarying requires a function.');
    for (const entry of this.entries) {
      const ease = factory.call(entry.node, entry.datum, entry.index, entry.group);
      if (typeof ease !== 'function') throw new Error('easeVarying factory must return an ease function.');
      entry.timing.ease = entry.item.ease = ease;
    }
    return this;
  }

  attr(name: string, value: Value<Datum, string | number | boolean | null>): this {
    if (!this.entries.length) return this;
    const fullname = namespace(name);
    const interpolate = name === 'transform' ? interpolateTransformSvg : interpolateValue;
    return this.record(name, (entry) => {
      const target = resolve(entry, value);
      const node = entry.node;
      const read = () => typeof fullname === 'string'
        ? node.getAttribute(fullname)
        : node.getAttributeNS(fullname.space, fullname.local);
      const write = (next: string) => typeof fullname === 'string'
        ? node.setAttribute(fullname, next)
        : node.setAttributeNS(fullname.space, fullname.local, next);
      if (target == null) {
        return () => { typeof fullname === 'string' ? node.removeAttribute(fullname) : node.removeAttributeNS(fullname.space, fullname.local); };
      }
      const value1 = String(target);
      const value0 = read();
      if (value0 === value1) return () => write(value1);
      const i = (interpolate as (a: unknown, b: unknown) => Interpolator)(value0, value1);
      return (t) => write(String(i(t)));
    });
  }

  attrTween(name: string, factory: TweenFactory<Datum> | ((this: Element, datum: Datum, index: number, group: Element[]) => Interpolator | null | undefined)): this {
    if (!this.entries.length) return this;
    const fullname = namespace(name);
    return this.record(name, (entry) => {
      const i = (factory as TweenFactory<Datum>).call(entry.node, entry.datum, entry.index, entry.group) as unknown as Interpolator | null | undefined;
      if (!i) return null;
      const node = entry.node;
      return (t) => {
        const next = String(i(t));
        typeof fullname === 'string' ? node.setAttribute(fullname, next) : node.setAttributeNS(fullname.space, fullname.local, next);
      };
    });
  }

  style(name: string, value: Value<Datum, string | number | null>, priority: 'important' | null = null): this {
    if (!this.entries.length) return this;
    return this.record(`style.${name}`, (entry) => {
      const target = resolve(entry, value);
      const node = entry.node as HTMLElement | SVGElement;
      if (target == null) return () => node.style.removeProperty(name);
      const value1 = String(target);
      const value0 = styleValue(node, name);
      if (value0 === value1) return () => node.style.setProperty(name, value1, priority ?? '');
      const i = interpolateValue(value0, value1) as Interpolator;
      return (t) => node.style.setProperty(name, String(i(t)), priority ?? '');
    });
  }

  styleTween(name: string, factory: (this: Element, datum: Datum, index: number, group: Element[]) => Interpolator | null | undefined, priority: 'important' | null = null): this {
    return this.record(`style.${name}`, (entry) => {
      const i = factory.call(entry.node, entry.datum, entry.index, entry.group);
      if (!i) return null;
      const node = entry.node as HTMLElement | SVGElement;
      return (t) => node.style.setProperty(name, String(i(t)), priority ?? '');
    });
  }

  tween(name: string, factory: TweenFactory<Datum>): this {
    return this.record(name, (entry) => {
      const apply = factory.call(entry.node, entry.datum, entry.index, entry.group);
      return apply ? (t) => apply.call(entry.node, t) : null;
    });
  }

  text(value: Value<Datum, string | number | null>): this {
    return this.record('text', (entry) => {
      const next = resolve(entry, value);
      return () => { entry.node.textContent = next == null ? '' : String(next); };
    });
  }

  /** Remove the node once the item finishes. Seeking never removes; finish() does. */
  remove(): this {
    for (const entry of this.entries) entry.remove = true;
    return this;
  }

  /** Chain a step that starts when this one ends, inheriting duration and ease. */
  transition(): Recorder<Element_, Datum> {
    const first = this.entries[0]?.timing;
    const next = new Recorder(this.source, this.sink, {
      time: first ? first.time + first.delay + first.duration : 0,
      delay: 0,
      duration: first?.duration ?? 0,
      ease: first?.ease ?? ((t) => t)
    });
    // Per-node timing: each chained entry follows its own parent entry.
    next.entries.forEach((entry, index) => {
      const parent = this.entries[index]?.timing;
      if (!parent) return;
      entry.timing.time = entry.item.time = parent.time + parent.delay + parent.duration;
      entry.timing.duration = entry.item.duration = parent.duration;
      entry.timing.ease = entry.item.ease = parent.ease;
    });
    return next;
  }

  call<Args extends unknown[]>(fn: (recorder: this, ...args: Args) => unknown, ...args: Args): this {
    fn(this, ...args);
    return this;
  }

  each(fn: ValueFn<Datum, void>): this {
    for (const entry of this.entries) fn.call(entry.node, entry.datum, entry.index, entry.group);
    return this;
  }

  filter(predicate: string | ValueFn<Datum, boolean>): Recorder<Element_, Datum> {
    const filtered = this.source.filter(predicate as string) as Selection<Element_, Datum, any, any>;
    const first = this.entries[0]?.timing ?? { time: 0, delay: 0, duration: 0, ease: (t: number) => t };
    return new Recorder(filtered, this.sink, first);
  }

  empty(): boolean { return this.entries.length === 0; }
  size(): number { return this.entries.length; }
  nodes(): Element[] { return this.entries.map((entry) => entry.node); }
  node(): Element | null { return this.entries[0]?.node ?? null; }

  on(type: string, listener: unknown): this {
    if (listener == null) return this;
    throw new Error(`Recorded transitions cannot run "${type}" handlers: side effects do not seek. Compute the state up front instead.`);
  }

  private record(name: string, create: Entry<Datum>['factories'][number]['create']): this {
    for (const entry of this.entries) entry.factories.push({ name, create });
    return this;
  }
}

/** Record seekable changes for `selection`, using the same call shape as `selection.transition()`. */
export function record<Element_ extends BaseType, Datum>(
  selection: Selection<Element_, Datum, any, any>,
  sink: TrackItem[],
  timing: Timing
): Recorder<Element_, Datum> {
  return new Recorder(selection, sink, timing);
}

function createItem<Datum>(entry: Entry<Datum>): TrackItem {
  return {
    node: entry.node,
    time: entry.timing.time,
    delay: entry.timing.delay,
    duration: entry.timing.duration,
    ease: entry.timing.ease,
    init() {
      const tweens: Tween[] = [];
      for (const factory of entry.factories) {
        const apply = factory.create(entry);
        if (apply) tweens.push({ name: factory.name, apply });
      }
      return tweens;
    },
    finish() {
      if (entry.remove) entry.node.parentNode?.removeChild(entry.node);
    },
    cancel() { /* nothing scheduled, nothing to release */ }
  };
}

function resolve<Datum, Result>(entry: Entry<Datum>, value: Value<Datum, Result>): Result {
  return typeof value === 'function'
    ? (value as ValueFn<Datum, Result>).call(entry.node, entry.datum, entry.index, entry.group)
    : value;
}

function styleValue(node: HTMLElement | SVGElement, name: string): string {
  return node.style.getPropertyValue(name)
    || (node.ownerDocument?.defaultView ?? window).getComputedStyle(node).getPropertyValue(name);
}
