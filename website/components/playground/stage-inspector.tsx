'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import type { InspectedProperty, TransitionInspection } from 'visdelta/transition';

const GROUPS = ['Marks', 'Axes', 'Grid', 'Legend'] as const;
type Group = typeof GROUPS[number];
const ROW = 24;
const VIEW = 216;

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const groupOf = (node: Element): Group => node.closest('.vd-legend, .vd-legend-svg') ? 'Legend'
  : node.closest('.vd-grid') ? 'Grid' : node.closest('.vd-axis, .vd-axis-label') ? 'Axes' : 'Marks';
const labelOf = (node: Element) => {
  const key = node.getAttribute('data-key');
  const classes = (node.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).map(name => name.replace(/^vd-/, '')).join('.');
  return `${classes || node.tagName.toLowerCase()}${key ? ` ${key}` : ''}`;
};
const read = (track: InspectedProperty) => !track.node.isConnected ? 'Not mounted in this frame'
  : track.kind === 'custom' ? 'Not exposed'
  : track.kind === 'text' ? track.node.textContent
  : track.kind === 'style' ? getComputedStyle(track.node).getPropertyValue(track.name.slice(6))
  : track.node.getAttribute(track.name);
/** Long decimals are noise at reading size; the exact value stays in the tooltip. */
const short = (value: string | null | undefined) => (value ?? 'absent').replace(/-?\d+\.\d{3,}/g, number => String(Number(Number(number).toFixed(2))));
const exposed = (track: InspectedProperty, value: string | null | undefined) => track.kind === 'custom' ? 'not exposed' : short(value);

export function StageInspector({ inspect, position, leg, offset, duration, stageCount, selectedStage, onScrub }: {
  inspect: () => Promise<TransitionInspection | undefined>;
  position: number;
  leg: number;
  offset: number;
  duration: number;
  stageCount: number;
  selectedStage?: number;
  onScrub: (position: number) => void;
}) {
  const [result, setResult] = useState<TransitionInspection>();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<InspectedProperty>();
  const [filter, setFilter] = useState('');
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<number>();
  const [group, setGroup] = useState<Group>();
  const [scroll, setScroll] = useState(0);
  const [revision, setRevision] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let valid = true;
    inspect().then(next => { if (valid) { setResult(next); setSelected(undefined); setError(next ? '' : 'Select a saved transition to inspect it.'); } })
      .catch(() => { if (valid) setError('Stage inspection unavailable.'); });
    return () => { valid = false; };
  }, [inspect, leg, revision]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => setRevision(n => n + 1), 150); };
    const observer = new ResizeObserver(refresh);
    const chart = root.current?.closest('.pg-workspace')?.querySelector('.pg-stage') ?? document.querySelector('.pg-stage');
    if (chart) observer.observe(chart);
    const theme = new MutationObserver(refresh);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => { clearTimeout(timer); observer.disconnect(); theme.disconnect(); };
  }, []);

  const local = position - leg;
  const phases = result?.stages ?? [];
  const phaseNumber = (stage: { start: number }) => Math.floor(stage.start * stageCount + 1e-9);
  const activeIndex = phases.findIndex(stage => local >= stage.start && (local < stage.end || stage.end === 1 && local === 1));
  const selectedIndex = phases.findIndex(stage => phaseNumber(stage) === selectedStage);
  const index = Math.min(phases.length - 1, picked ?? (activeIndex >= 0 ? activeIndex : Math.max(0, selectedIndex)));
  const phase = phases[index];
  const progress = phase ? Math.max(0, Math.min(1, (local - phase.start) / (phase.end - phase.start))) : 0;
  const at = (stage: { start: number; end: number }, fraction: number) => offset + (stage.start + fraction * (stage.end - stage.start)) * duration;

  // Moving tracks first, then those whose endpoints match: the real motion stands out.
  const rows = useMemo(() => {
    if (!phase) return [];
    const needle = filter.toLowerCase();
    const matching = phase.properties.filter(track => `${labelOf(track.node)} ${track.name}`.toLowerCase().includes(needle));
    const moves = (track: InspectedProperty) => track.kind === 'custom' || track.from !== track.to;
    return [...matching.filter(moves), ...matching.filter(track => !moves(track))];
  }, [phase, filter]);
  const counts = useMemo(() => GROUPS.map(name => rows.filter(track => groupOf(track.node) === name).length), [rows]);
  const shown = group && counts[GROUPS.indexOf(group)] ? group : GROUPS[counts.findIndex(count => count > 0)] ?? 'Marks';
  const list = rows.filter(track => groupOf(track.node) === shown);
  const first = Math.max(0, Math.floor(scroll / ROW) - 4);
  const last = Math.min(list.length, first + Math.ceil(VIEW / ROW) + 8);
  // Reading the box never modifies the rendered node or its animation styles.
  const box = selected?.node.isConnected ? selected.node.getBoundingClientRect() : null;

  return <div className="pg-inspector" ref={root} aria-label="Stage inspector">
    {error ? <p role="status">{error}</p> : !result || !phase ? <p role="status">Reading compiled stages…</p> : <>
      <header className="pg-inspector-head">
        <span className="pg-inspector-title"><strong>Transition {leg + 1} → {leg + 2}</strong>
          <span>{seconds(at(phase, 0))}–{seconds(at(phase, 1))} · {phase.properties.length} tracks</span></span>
        <span className="pg-inspector-find">
          {searching || filter ? <input autoFocus aria-label="Filter element tracks" placeholder="Filter" value={filter}
            onChange={event => { setFilter(event.target.value); setScroll(0); }}
            onBlur={() => { if (!filter) setSearching(false); }} />
            : <button type="button" aria-label="Filter element tracks" title="Filter tracks" onClick={() => setSearching(true)}><Search aria-hidden="true" className="size-3.5" /></button>}
        </span>
      </header>
      {phases.length > 1 && <div className="pg-inspector-tabs" role="tablist" aria-label="Phases">
        {phases.map((stage, number) => <button key={number} type="button" role="tab" aria-selected={number === index} data-active={number === activeIndex || undefined}
          title={`Show the midpoint of phase ${number + 1}`}
          onClick={() => { setPicked(number); setScroll(0); onScrub(leg + (stage.start + stage.end) / 2); }}>
          Stage {phaseNumber(stage) + 1} · phase {number + 1}</button>)}
      </div>}
      <div className="pg-inspector-tabs" role="tablist" aria-label="Element groups">
        {GROUPS.map((name, number) => counts[number] ? <button key={name} type="button" role="tab" aria-selected={name === shown}
          onClick={() => { setGroup(name); setScroll(0); }}>{name} <span>{counts[number]}</span></button> : null)}
      </div>
      {list.length ? <div className="pg-inspector-list" role="table" aria-label={`${shown} tracks`} style={{ maxHeight: VIEW }}
        onScroll={event => setScroll(event.currentTarget.scrollTop)}>
        <div style={{ height: list.length * ROW, position: 'relative' }}>
          {list.slice(first, last).map((track, row) => {
            const moving = track.kind === 'custom' || track.from !== track.to;
            const current = progress >= track.start && progress <= track.end;
            const now = read(track);
            return <div key={first + row} role="row" className="pg-inspector-row" data-still={!moving || undefined} data-current={current || undefined} style={{ top: (first + row) * ROW }}>
              <span role="cell"><button type="button" aria-pressed={selected === track} title={track.selector} onClick={() => setSelected(selected === track ? undefined : track)}>{labelOf(track.node)}</button></span>
              <span role="cell" className="pg-inspector-prop">{track.name.replace(/^style\./, '')}</span>
              <span role="cell" className="pg-property-interval" aria-hidden="true" title={`${seconds(at(phase, track.start))}–${seconds(at(phase, track.end))}`}>
                <span style={{ left: `${track.start * 100}%`, width: `${(track.end - track.start) * 100}%` }} /></span>
              <code role="cell" title={`from ${track.from ?? 'absent'}\nto ${track.to ?? 'absent'}\nnow ${now ?? 'absent'}`}>
                {moving ? <>{exposed(track, track.from)} <i aria-hidden="true">→</i> {exposed(track, track.to)}</> : exposed(track, track.from)}</code>
            </div>;
          })}
        </div>
      </div> : <p>No matching recorded property tracks.</p>}
      <details className="pg-inspector-notes"><summary>Coverage and timing</summary>{result.notes.map(note => <p key={note}>{note}</p>)}</details>
    </>}
    {box && box.width > 0 && createPortal(<div className="pg-element-highlight" aria-hidden="true" style={{ left: box.left - 2, top: box.top - 2, width: box.width + 4, height: box.height + 4 }} />, document.body)}
  </div>;
}
