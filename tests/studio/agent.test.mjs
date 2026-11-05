import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentRunner} from '../../website/server/liveshow/agent.mjs';
import {initialSpec,sales} from '../../website/components/liveshow/presets.ts';
import {barModule} from 'visdelta/bar';
import {searchDocs,authorChart} from '../../website/server/liveshow/chart-authoring.mjs';

const input={prompt:'Use blue and highlight Beacon',revision:0,spec:initialSpec,observation:{revision:0,marks:[],orders:{leftToRight:[]}}};
const call=(name,args)=>({choices:[{message:{role:'assistant',tool_calls:[{id:'call',type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});
const edits=[{method:'color',args:[{value:'blue'}]},{method:'highlight',args:[{product:'Beacon'}]}];

test('native calls use MCP and complete only after a matching browser receipt',async()=>{
 let steps=0;
 const run=createAgentRunner({complete:async({tools})=>{steps++;assert.ok(tools.some(t=>t.function.name==='edit_chart'));assert.ok(!tools.some(t=>t.function.name==='apply_chart_proposal'));return call('edit_chart',{revision:0,edits,summary:'Blue with Beacon highlighted'});}});
 const first=await run(input,{key:'test'});
 assert.equal(first.command.action,'edit');assert.deepEqual(first.command.message.edits,edits);
 const target=await barModule.edit(initialSpec,edits,{...initialSpec,data:sales});
 const accepted=await run({...input,spec:target,revision:1,observation:{...input.observation,revision:1},sessionId:first.sessionId,toolCallId:first.toolCallId,receipt:{status:'applied',revision:1}},{key:'test'});
 assert.equal(accepted.verified,true);assert.equal(steps,1);
});

test('a false browser receipt is not reported as verified',async()=>{
 const run=createAgentRunner({complete:async()=>call('edit_chart',{revision:0,edits})});
 const first=await run(input,{key:'test'});
 const result=await run({...input,revision:1,observation:{...input.observation,revision:1},sessionId:first.sessionId,toolCallId:first.toolCallId,receipt:{status:'applied',revision:1}},{key:'test'});
 assert.equal(result.verified,undefined);assert.match(result.explanation,/does not match/);
});

test('repeated invalid native calls stop with the real validator reason',async()=>{
 let count=0;
 const run=createAgentRunner({complete:async()=>{count++;return call('edit_chart',{revision:0,edits:[{method:'y',args:['missing']}]});}});
 const result=await run(input,{key:'test'});
 assert.equal(result.command,undefined);assert.equal(count,2);assert.match(result.explanation,/missing/);
 assert.ok(result.trace.some(entry=>entry.status==='blocked'));
});

test('a requested image pauses for browser capture; ordinary edits need no image',async()=>{
 let count=0;
 const run=createAgentRunner({complete:async({messages})=>{
   count++;
   if(count===1){assert.ok(!messages.some(message=>Array.isArray(message.content)));return call('capture_chart',{});}
   assert.ok(messages.some(message=>Array.isArray(message.content)&&message.content.some(block=>block.type==='image_url')));
   return call('edit_chart',{revision:0,edits});
 }});
 const first=await run(input,{key:'test'});assert.equal(first.command.action,'capture');
 const second=await run({...input,sessionId:first.sessionId,toolCallId:first.toolCallId,receipt:{status:'applied',revision:0},capture:{revision:0,mimeType:'image/png',dataUrl:'data:image/png;base64,aGVsbG8=',width:600,height:400}},{key:'test'});
 assert.equal(second.command.action,'edit');assert.equal(count,2);
});

test('design warnings are advisory and do not create an approval state machine',async()=>{
 const spec=structuredClone(initialSpec);spec.encoding.y.domain=[50,100];
 const events=[];
 const run=createAgentRunner({complete:async()=>call('set_chart',{revision:0,spec,summary:'Requested comparison window'})});
 const result=await run(input,{key:'test',onEvent:event=>events.push(event)});
 assert.equal(result.command.action,'replace');assert.ok(events.some(event=>event.type==='design_advice'&&event.detail.includes('candidate')));
});

test('package documentation is version matched and data binding cannot be silently replaced',()=>{
 const result=searchDocs('bar breakdown layout');assert.ok(result.sections.length);assert.ok(result.sections.every(section=>section.source.startsWith('visdelta/docs/')));
 assert.throws(()=>authorChart({...initialSpec,data:{values:sales.slice(1)}},initialSpec.data,sales),/Keep the current dataset/);
 assert.deepEqual(authorChart(initialSpec),initialSpec);
});


test('service shutdown closes model sessions waiting for a browser receipt',async()=>{
 const closed=[];
 const complete=Object.assign(async()=>call('edit_chart',{revision:0,edits}),{close:id=>closed.push(id)});
 const run=createAgentRunner({complete});const first=await run(input,{key:'test'});
 run.close();assert.deepEqual(closed,[first.sessionId]);
 await assert.rejects(run({...input,sessionId:first.sessionId},{key:'test'}),/expired/);
});
