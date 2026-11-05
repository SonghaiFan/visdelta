import { visualizationWarnings } from 'visdelta';
import { BarState } from 'visdelta/bar';
import { PieState } from 'visdelta/pie';
import { LineState } from 'visdelta/line';
import { AreaState } from 'visdelta/area';
import { PointState } from 'visdelta/point';
import { UnitState } from 'visdelta/unit';
const states = { bar: BarState, pie: PieState, line: LineState, area: AreaState, point: PointState, unit: UnitState };
const scope = 'VisDelta heuristics on the transformed data; not a ranking of all charts, proof of validity, or a requirement to change the user’s choice.';
/** Public builders carry the chart module needed by the public warnings API. */
export async function inspectDesignAdvice(spec, rows) {
  try {
    const State = states[spec.mark];
    if (!State) throw new Error('No registered chart module for design advice.');
    const warnings = await visualizationWarnings(new State(spec), { [spec.data.name]: rows });
    return { status: 'ok', engine: 'VisDelta.visualizationWarnings', warnings, scope };
  } catch (error) {
    return { status: 'unavailable', engine: 'VisDelta.visualizationWarnings', warnings: [], scope,
      reason: (error instanceof Error ? error.message : 'Could not evaluate design advice.').slice(0, 400) };
  }
}
