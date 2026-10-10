import type { VisualizationTransition } from '../transition.js';

/** Internal timing detail shared by transition() and sequence(). */
export interface TimedVisualizationTransition extends VisualizationTransition {
  stageCount(): number;
}
