import {randomUUID} from 'node:crypto';
import {parseSpec, resolveEncodingTypes} from 'visdelta/core';
import {barModule} from 'visdelta/bar';
import {lineModule} from 'visdelta/line';
import {areaModule} from 'visdelta/area';
import {pointModule} from 'visdelta/point';
import {pieModule} from 'visdelta/pie';
import {unitModule} from 'visdelta/unit';
import {datasetForSpec} from '../../components/liveshow/presets.ts';

const modules = {bar:barModule,line:lineModule,area:areaModule,point:pointModule,pie:pieModule,unit:unitModule};
export class AIError extends Error {
  constructor(status,message) {super(message);this.status=status;}
}
export function validateInput(input) {
  if (!input || typeof input.prompt!=='string' || !input.prompt.trim() || input.prompt.length>2000
    || !Number.isSafeInteger(input.revision) || input.revision<0 || !input.spec) throw new AIError(400,'Provide a prompt (up to 2,000 characters), chart and revision.');
  let spec;
  try {spec=parseSpec(JSON.stringify(input.spec));} catch {throw new AIError(400,'Invalid chart declaration.');}
  if (!modules[spec.mark] || !datasetForSpec(spec) || Object.keys(spec.data??{}).length!==1) throw new AIError(400,'Select a workspace dataset and a registered chart.');
  return {prompt:input.prompt.trim(),revision:input.revision,spec};
}
/** Same public adapters as browser view.edit; transport adds no chart-specific rules. */
export async function validatePlan(plan,input,includeTarget=false) {
  if (!plan || typeof plan.explanation!=='string' || plan.explanation.length>1200 || !Array.isArray(plan.edits)
    || plan.edits.length>32 || plan.edits.some(edit=>!edit || typeof edit.method!=='string' || !Array.isArray(edit.args))) throw new AIError(502,'Invalid edit message.');
  const rows=datasetForSpec(input.spec)?.rows;
  if (!rows) throw new AIError(400,'Unknown workspace dataset.');
  let targetSpec;
  try {
    const resolved={...input.spec,data:{values:rows},encoding:resolveEncodingTypes(rows,input.spec.encoding)};
    targetSpec=await modules[input.spec.mark].edit(input.spec,plan.edits,resolved);
  } catch(error) {
    const rejection=new AIError(422,`VisDelta rejected the proposed edits: ${error instanceof Error?error.message.slice(0,600):'Invalid arguments'}. Your chart has not changed.`);
    rejection.details=error instanceof Error?error.message.slice(0,600):'Invalid VisDelta arguments.';
    throw rejection;
  }
  return {explanation:plan.explanation,message:{requestId:randomUUID(),baseRevision:input.revision,edits:plan.edits},...(includeTarget?{targetSpec}:{})};
}
