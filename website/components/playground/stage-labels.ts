import type { VisualizationTransition } from 'visdelta/transition';
import { formatChange } from '@/components/live/transition-player';
import type { DeclarationOperationChange } from 'visdelta/core';

/** Display the planner's authored slot, never infer it from semantic categories. */
export function operationDetails(operation: DeclarationOperationChange): string {
  const path = (operation.next ?? operation.previous)!.path;
  const name = path.slice(path[0] === 'meta' && path[1] === 'unit' ? 2 : path[0] === 'encoding' ? 1 : 0).join('.');
  const value = (slot: DeclarationOperationChange['previous']) => {
    if (!slot?.value.present) return 'unset';
    const value = slot.value.value;
    return typeof value === 'string' ? value : JSON.stringify(value);
  };
  const index = operation.fromIndex ?? operation.toIndex;
  return `${name}${index === undefined ? '' : ` [${index}]`}: ${value(operation.previous)} → ${value(operation.next)}`;
}

const words = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase();
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const field = (value: unknown) => typeof value === 'string' ? words(value) : 'the selected field';

export function operationLabel(operation: DeclarationOperationChange): string {
  const path = (operation.next ?? operation.previous)!.path;
  const before = operation.previous?.value.present ? operation.previous.value.value : undefined;
  const after = operation.next?.value.present ? operation.next.value.value : undefined;
  const old = record(before), next = record(after);
  const name = path.at(-1)!;
  if (name === 'layout' && (old.type || next.type)) {
    if (old.type !== next.type) return `Change layout from ${field(old.type)} to ${field(next.type)}`;
    if (record(old.x).field !== record(next.x).field) return `Position ${field(next.type)} by ${field(record(next.x).field)}`;
    return `Update ${field(next.type)} layout`;
  }
  if (path[0] === 'encoding') {
    const channel = path[1];
    if (channel === 'size' && typeof next.value === 'number') return `Change mark size to ${next.value}`;
    const purpose = ({ x: 'horizontal position', y: 'vertical position', color: 'color', size: 'size', tooltip: 'tooltips' } as Record<string, string>)[channel] ?? words(channel);
    const axis = channel === 'x' ? 'horizontal axis' : channel === 'y' ? 'vertical axis' : purpose;
    if (next.field !== old.field && next.field) return `Use ${field(next.field)} for ${purpose}`;
    if (before === undefined && next.field) return `Use ${field(next.field)} for ${purpose}`;
    if (after === undefined) return `Remove the ${purpose} setting`;
    if (old.label !== next.label) return next.label ? `Rename the ${axis} to “${String(next.label)}”` : `Use the default ${axis} label`;
    if (old.type !== next.type) return `Treat ${purpose} as ${next.type === 'quantitative' ? 'numbers' : next.type === 'nominal' ? 'categories' : String(next.type ?? 'the default type')}`;
    return `Update ${purpose} settings`;
  }
  if (name === 'radius') return after === undefined ? 'Use the default dot size' : `Change dot radius to ${String(after)}`;
  if (name === 'columns') return after === undefined ? 'Remove the grid column setting' : `Arrange the grid in ${String(after)} columns`;
  if (name === 'layout') return `Change layout from ${field(before)} to ${field(after)}`;
  if (name === 'focus') return after === undefined ? 'Remove focus' : 'Focus on selected marks';
  if (name === 'highlight') return after === undefined ? 'Remove highlighting' : 'Highlight selected marks';
  const label = words(name);
  if (after === undefined) return `Remove the ${label} setting`;
  if (after === null || typeof after !== 'object') return `Set ${label} to ${String(after)}`;
  return `${before === undefined ? 'Add' : 'Update'} ${label} settings`;
}

export function stageDetails(controller: Pick<VisualizationTransition, 'stageOperations'>): string[] {
  return controller.stageOperations().map(operation => operation ? operationDetails(operation) : 'Chart-defined intermediate state; no single declaration operation.');
}

export function stageLabels(controller: Pick<VisualizationTransition, 'stageOperations' | 'stageChanges'>): string[] {
  const operations = controller.stageOperations();
  const changes = operations.some(operation => !operation) ? controller.stageChanges() : [];
  return operations.map((operation, index) => operation ? operationLabel(operation)
    : `Chart stage: ${changes[index].map(formatChange).join(' · ') || 'No additional semantic change'}`);
}
