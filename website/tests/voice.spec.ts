import {expect,test} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

function wav(seconds:number,tone=false){
 const frames=Math.floor(24000*seconds),bytes=Buffer.alloc(44+frames*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(24000,24);bytes.writeUInt32LE(48000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
 if(tone)for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(Math.sin(i/24000*Math.PI*880)*8000),44+i*2);
 return bytes;
}
// A real Chromium media stream/worklet with deterministic non-silent input.
mkdirSync('test-results',{recursive:true});
const microphoneFile=resolve('test-results/microphone.wav');writeFileSync(microphoneFile,wav(2,true));

test.use({permissions:['microphone'],launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${microphoneFile}`]}});

test('push-to-talk releases microphone before STT, applies native calls, verifies, then speaks',async({page})=>{
 const calls:string[]=[];let turn=0;
 await page.addInitScript(()=>{
  const tracked=window as unknown as {microphoneTracks:MediaStreamTrack[]};tracked.microphoneTracks=[];
  const open=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async options=>{const stream=await open(options);tracked.microphoneTracks.push(...stream.getTracks());return stream;};
 });
 await page.route('**/api/liveshow/status/',async route=>{
  const response=await route.fetch();const status=await response.json();
  await route.fulfill({json:{...status,configured:true,voiceInput:true}});
 });
 await page.route('**/api/liveshow/transcribe/',async route=>{
  const input=route.request().postDataJSON();
  expect(input.audio.format).toBe('pcm16');expect(input.audio.sampleRate).toBe(24000);
  expect(Buffer.from(input.audio.data,'base64').length).toBeGreaterThan(9600);
  expect(await page.evaluate(()=>{const tracks=(window as unknown as {microphoneTracks:MediaStreamTrack[]}).microphoneTracks;return tracks.length>0&&tracks.every(track=>track.readyState==='ended');})).toBe(true);
  calls.push('transcribe');await route.fulfill({json:{text:'Show profit'}});
 });
 await page.route('**/api/liveshow/agent/',async route=>{
  const input=route.request().postDataJSON();expect(input.prompt).toBe('Show profit');
  if(turn++===0){
   calls.push('edit');
   await route.fulfill({json:{sessionId:'voice-test',toolCallId:'edit',command:{action:'edit',message:{requestId:'voice-edit',baseRevision:input.revision,edits:[{method:'y',args:['profit']}]}}}});
  }else{
   expect(input.receipt.status).toBe('applied');expect(input.spec.encoding.y.field).toBe('profit');
   expect(input.observation.revision).toBe(input.revision);
   calls.push('verify');await route.fulfill({json:{explanation:'Showing profit.',verified:true}});
  }
 });
 await page.route('**/api/liveshow/speech/',async route=>{
  expect(route.request().postDataJSON().text).toBe('Showing profit.');calls.push('speech');
  await route.fulfill({contentType:'audio/wav',body:wav(0.1)});
 });
 await page.goto('liveshow/');
 const button=page.getByRole('button',{name:'Hold to speak',exact:true});await expect(button).toBeEnabled();
 await button.focus();await page.keyboard.down('Space');
 await expect(page.getByLabel('Microphone status')).toContainText('Listening');
 await page.waitForTimeout(450);expect(calls).toEqual([]);
 await page.keyboard.up('Space');
 await expect(page.getByLabel('Voice reply text')).toHaveText('Showing profit.');
 await expect(page.getByLabel('Microphone status')).toHaveText('Hold to speak, release to send');
 expect(calls).toEqual(['transcribe','edit','verify','speech']);
 await expect(page.getByRole('status')).toContainText('revision 1');
});
