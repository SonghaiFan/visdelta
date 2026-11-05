import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserBridge} from '../../website/server/liveshow/browser-bridge.mjs';
import {initialSpec,sales} from '../../website/components/liveshow/presets.ts';

const snapshot=(clientId,revision=0)=>({clientId,revision,spec:initialSpec,sourceRows:sales,observation:{revision,marks:[]}});

test('background heartbeats cannot take the active workspace or consume its command',async()=>{
 const bridge=createBrowserBridge();
 try{
  bridge.publish(snapshot('first'));bridge.publish({...snapshot('second'),activate:true});
  bridge.publish(snapshot('first',4));assert.equal((await bridge.state()).clientId,'second');
  const result=bridge.inspect();
  assert.equal(bridge.next('first'),null);
  const command=bridge.next('second');assert.equal(command.command.baseRevision,0);
  assert.throws(()=>bridge.finish({id:command.id,clientId:'first'}),/Unknown/);
  bridge.finish({id:command.id,clientId:'second',spec:initialSpec,receipt:{status:'applied',revision:0},observation:{revision:0,marks:[{key:'Atlas'}]}});
  assert.deepEqual(await result,{revision:0,marks:[{key:'Atlas'}]});
 }finally{bridge.close();}
});

test('switching workspace rejects queued work instead of applying it to another tab',async()=>{
 const bridge=createBrowserBridge();bridge.publish(snapshot('first'));
 const result=bridge.inspect();const rejected=assert.rejects(result,/workspace changed/);
 bridge.publish({...snapshot('second'),activate:true});await rejected;
 assert.equal(bridge.next('first'),null);assert.equal(bridge.next('second'),null);bridge.close();
});

test('one command runs at a time and service shutdown rejects pending work',async()=>{
 const bridge=createBrowserBridge();bridge.publish(snapshot('first'));
 const result=bridge.inspect();const rejected=assert.rejects(result,/service closed/);
 await assert.rejects(bridge.capture(),/already running/);
 bridge.close();await rejected;assert.equal(bridge.next('first'),null);
});
