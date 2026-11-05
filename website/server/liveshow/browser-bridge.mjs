import {randomUUID} from 'node:crypto';
import {delta} from 'visdelta/core';
import {validatePlan} from './ai.mjs';
import {authorChart,searchDocs} from './chart-authoring.mjs';
import {inspectDesignAdvice} from './design-advice.mjs';

/** One active local workspace; commands resolve only after its browser receipt. */
export function createBrowserBridge() {
  let current,seen=0;
  const queue=[],pending=new Map();
  const state=()=>{if(!current||Date.now()-seen>15_000)throw Error('Open Liveshow in the local Studio first.');return current;};
  const check=revision=>{const value=state();if(revision!==value.revision)throw Error('Stale chart revision. Read get_chart_state again.');return value;};
  function request(command,expectedSpec) {
    const workspace=state();
    if(pending.size)throw Error('A browser command is already running. Wait for its receipt.');
    return new Promise((resolve,reject)=>{
      const id=randomUUID();
      const timer=setTimeout(()=>{pending.delete(id);const index=queue.findIndex(item=>item.id===id);if(index>=0)queue.splice(index,1);reject(Error('Browser command timed out.'));},20_000);
      pending.set(id,{resolve,reject,timer,expectedSpec,clientId:workspace.clientId});queue.push({id,clientId:workspace.clientId,command:{...command,baseRevision:workspace.revision}});
    });
  }
  return {
    publish(value){
      if(typeof value.clientId!=='string'||!Number.isSafeInteger(value.revision)||!value.spec||!value.observation)throw Error('Invalid browser snapshot.');
      if(current&&current.clientId!==value.clientId&&Date.now()-seen<15_000&&!value.activate)return;
      if(current&&current.clientId!==value.clientId){for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('The active workspace changed. Read its state again.'));}pending.clear();queue.length=0;}
      current=value;seen=Date.now();
    },
    next(clientId){if(current?.clientId===clientId&&queue[0]?.clientId===clientId)return queue.shift();return null;},
    finish(value){
      const item=pending.get(value.id);if(!item||item.clientId!==value.clientId)throw Error('Unknown browser command.');
      clearTimeout(item.timer);pending.delete(value.id);
      if(value.receipt?.status!=='applied'){item.reject(Error(value.error||'The browser rejected the command.'));return;}
      try{
      if(item.expectedSpec&&(value.spec?.mark!==item.expectedSpec.mark||delta(item.expectedSpec,value.spec).stateChanges.length)){item.reject(Error('The browser state does not match the validated destination.'));return;}
      }catch(error){item.reject(error);return;}
      current={...current,spec:value.spec,revision:value.receipt.revision,observation:value.observation};seen=Date.now();
      item.resolve({receipt:value.receipt,spec:value.spec,...(value.observation?{observation:value.observation}:{}),...(value.capture?value.capture:{})});
    },
    state:async()=>state(),
    inspect:async()=>{const result=await request({action:'inspect'});return result.observation;},
    capture:async()=>{const result=await request({action:'capture'});return result;},
    edit:async args=>{const input=check(args.revision);const plan=await validatePlan({explanation:args.summary??'MCP edit',edits:args.edits},input,true);return request({action:'edit',message:plan.message},plan.targetSpec);},
    setChart:async args=>{const input=check(args.revision);const spec=authorChart(args.spec,input.spec.data,input.sourceRows);return request({action:'replace',spec},spec);},
    restore:async args=>{check(args.revision);return request({action:args.action});},
    docs:async query=>searchDocs(query),
    advice:async args=>{const input=check(args.revision);return inspectDesignAdvice(args.spec??input.spec,input.sourceRows);},
    ask:async question=>({question}),
    close(){for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Workspace service closed.'));}pending.clear();queue.length=0;},
  };
}
