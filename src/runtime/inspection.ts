import type { FrameEvaluator, RecordedProperty } from './tracks.js';
import type { DomFrame } from './dom-frame.js';

/** Borrowed DOM references are valid until resize/destroy; consumers must not mutate them. */
export interface InspectedProperty extends RecordedProperty {
  /** Exact element path relative to the chart view at this phase. */
  selector: string;
  /** Values at phase boundaries, not a claim about a custom tween's implementation. */
  from: string | null;
  to: string | null;
}
export interface InspectedStage {
  /** Authored pair progress, in [0, 1]. */
  start: number;
  end: number;
  properties: InspectedProperty[];
}
export interface TransitionInspection {
  stages: InspectedStage[];
  notes: string[];
}
export interface InspectionFrame {
  start: number;
  end: number;
  reverse: boolean;
  evaluator: FrameEvaluator;
  dom: DomFrame;
}

export function readProperty(property: RecordedProperty): string | null {
  if (property.kind === 'custom') return null;
  if (property.kind === 'text') return property.node.textContent;
  if (property.kind === 'style') return (property.node as HTMLElement | SVGElement).style.getPropertyValue(property.name.slice(6)) || getComputedStyle(property.node).getPropertyValue(property.name.slice(6));
  return property.node.getAttribute(property.name);
}

/** Read actual compiled phase endpoints. The surface restores the visible frame in finally. */
export function inspectFrames(frames: InspectionFrame[], reverse: boolean): TransitionInspection {
  const stages = frames.map(frame => {
    const backwards = frame.reverse !== reverse;
    frame.dom.restore();
    frame.evaluator.progress(backwards ? 1 : 0, backwards ? -1 : 1);
    const span = frame.evaluator.span ?? 1;
    const recorded: RecordedProperty[] = (frame.evaluator.recordings ?? []).flatMap(({ item, start, tweens }) => (tweens ?? []).map(tween => ({
      node: item.node, name: tween.name, kind: tween.kind ?? (tween.name.startsWith('style.') ? 'style' : tween.name === 'text' ? 'text' : 'attribute'), start: start / span, end: (start + item.duration) / span,
    })));
    const properties = recorded.map(property => ({
      ...property,
      selector: elementPath(property.node),
      start: backwards ? 1 - property.end : property.start,
      end: backwards ? 1 - property.start : property.end,
      from: readProperty(property), to: null as string | null,
    }));
    frame.evaluator.progress(backwards ? 0 : 1, backwards ? -1 : 1);
    for (const property of properties) property.to = readProperty(property);
    return { start: reverse ? 1 - frame.end : frame.start,
      end: reverse ? 1 - frame.start : frame.end, properties };
  }).sort((a, b) => a.start - b.start);
  return { stages, notes: [
    'Values are compiled phase endpoints. Timing is the recorded property interval within that phase.',
    'Custom tweens may update nested elements; their individual properties are not exposed.',
    'Node insertion/removal and immediate renderer writes are not recorded property tracks.',
    'HTML title and subtitle follow whole-transition progress separately from these SVG phases.',
  ] };
}

function elementPath(node: Element): string {
  const parts: string[] = [];
  let current: Element | null = node;
  while (current && !current.classList.contains('vd-view')) {
    const tag = current.tagName.toLowerCase();
    const siblings: Element[] = current.parentElement ? Array.from(current.parentElement.children).filter(item => item.tagName === current!.tagName) : [current];
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
    current = current.parentElement;
  }
  return parts.join(' > ');
}
