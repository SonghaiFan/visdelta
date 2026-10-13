'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InspectedProperty, TransitionInspection } from 'visdelta/transition';

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const groupOf = (node: Element) => node.closest('.vd-legend, .vd-legend-svg') ? 'Legend'
  : node.closest('.vd-grid') ? 'Grid' : node.closest('.vd-axis, .vd-axis-label') ? 'Axes' : 'Marks and containers';
const labelOf = (node: Element) => {
  const key = node.getAttribute('data-key');
  const classes = (node.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).join('.');
  return `${node.tagName.toLowerCase()}${classes ? `.${classes}` : ''}${key ? ` [key=${key}]` : ''}`;
};
const read = (track: InspectedProperty) => !track.node.isConnected ? 'Not mounted in this frame'
  : track.kind === 'custom' ? 'Not exposed'
  : track.kind === 'text' ? track.node.textContent
  : track.kind === 'style' ? getComputedStyle(track.node).getPropertyValue(track.name.slice(6))
  : track.node.getAttribute(track.name);

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
  const [openPhases, setOpenPhases] = useState<Record<number, boolean>>({});
  const [pages, setPages] = useState<Record<number, number>>({});
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
  // Reading the box never modifies the rendered node or its animation styles.
  const box = selected?.node.isConnected ? selected.node.getBoundingClientRect() : null;
  return <div className="pg-inspector" ref={root} aria-label="Stage inspector">
    <div className="pg-inspector-tools">
      <strong>Transition {leg + 1} → {leg + 2}</strong>
      <input aria-label="Filter element tracks" placeholder="Filter element or attribute…" value={filter} onChange={event => { setFilter(event.target.value); setPages({}); }} />
      <button type="button" onClick={() => setRevision(n => n + 1)}>Refresh details</button>
    </div>
    {error ? <p role="status">{error}</p> : !result ? <p role="status">Reading compiled stages…</p> : <>
      <p>Recorded SVG phases. Values show phase endpoints; equal values can still have motion between them.</p>
      <div className="pg-inspector-scroll">
        {result.stages.map((stage, index) => {
          const stageNumber = Math.floor(stage.start * stageCount + 1e-9);
          const expanded = openPhases[index] ?? selectedStage === stageNumber;
          const active = position - leg >= stage.start && (position - leg < stage.end || stage.end === 1 && position - leg === 1);
          const rows = stage.properties.filter(track => `${labelOf(track.node)} ${track.name} ${groupOf(track.node)}`.toLowerCase().includes(filter.toLowerCase()));
          const page = Math.min(pages[index] ?? 0, Math.max(0, Math.ceil(rows.length / 50) - 1));
          const visible = rows.slice(page * 50, (page + 1) * 50);
          return <details key={index} open={expanded} onToggle={event => {
            const open = event.currentTarget.open;
            setOpenPhases(previous => previous[index] === open ? previous : { ...previous, [index]: open });
          }} className="pg-inspector-phase" data-active={active || undefined}>
            <summary>Stage {Math.floor(stage.start * stageCount + 1e-9) + 1} · phase {index + 1} · {seconds(offset + stage.start * duration)}–{seconds(offset + stage.end * duration)} · {stage.properties.length} tracks {active && `· current ${Math.round(Math.max(0, Math.min(1, (position - leg - stage.start) / (stage.end - stage.start))) * 100)}%`}</summary>
            {expanded && <div className="pg-inspector-phase-body">
            <button type="button" className="pg-inspector-seek" onClick={() => onScrub(leg + (stage.start + stage.end) / 2)}>Show phase midpoint</button>
            {['Marks and containers', 'Axes', 'Grid', 'Legend'].map(group => {
              const tracks = visible.filter(track => groupOf(track.node) === group);
              return tracks.length ? <section key={group}><h4>{group}</h4><div className="pg-inspector-table"><table>
                <thead><tr><th>Element</th><th>Property</th><th>Phase start</th><th>Phase end</th><th>Current</th><th>Scheduled interval</th></tr></thead>
                <tbody>{tracks.map((track, row) => <tr key={row} data-current={active && (position - leg - stage.start) / (stage.end - stage.start) >= track.start && (position - leg - stage.start) / (stage.end - stage.start) <= track.end || undefined}>
                  <td><button type="button" aria-pressed={selected === track} title={track.selector} onClick={() => setSelected(selected === track ? undefined : track)}>{labelOf(track.node)}</button></td>
                  <td>{track.kind} · {track.name}</td>
                  <td><code>{track.kind === 'custom' ? 'Not exposed' : track.from ?? 'absent'}</code></td>
                  <td><code>{track.kind === 'custom' ? 'Not exposed' : track.to ?? 'absent'}</code></td>
                  <td><code>{read(track) ?? 'absent'}</code></td>
                  <td><span className="pg-property-interval" aria-hidden="true"><span style={{ left: `${track.start * 100}%`, width: `${(track.end - track.start) * 100}%` }} /></span>{seconds(offset + (stage.start + track.start * (stage.end - stage.start)) * duration)}–{seconds(offset + (stage.start + track.end * (stage.end - stage.start)) * duration)}</td>
                </tr>)}</tbody>
              </table></div></section> : null;
            })}
            {!rows.length && <p>No matching recorded property tracks.</p>}
            {rows.length > 50 && <nav aria-label={`Phase ${index + 1} track pages`} className="pg-inspector-pages">
              <button type="button" disabled={page === 0} onClick={() => setPages(previous => ({ ...previous, [index]: page - 1 }))}>Previous tracks</button>
              <span>{page * 50 + 1}–{Math.min((page + 1) * 50, rows.length)} of {rows.length}</span>
              <button type="button" disabled={(page + 1) * 50 >= rows.length} onClick={() => setPages(previous => ({ ...previous, [index]: page + 1 }))}>Next tracks</button>
            </nav>}
            </div>}
          </details>;
        })}
      </div>
      <details className="pg-inspector-notes"><summary>Coverage and timing</summary>{result.notes.map(note => <p key={note}>{note}</p>)}</details>
    </>}
    {box && box.width > 0 && createPortal(<div className="pg-element-highlight" aria-hidden="true" style={{ left: box.left - 2, top: box.top - 2, width: box.width + 4, height: box.height + 4 }} />, document.body)}
  </div>;
}
