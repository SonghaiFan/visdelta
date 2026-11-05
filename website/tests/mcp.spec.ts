import {expect,test} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('external MCP operates the real browser with native batches, receipts and history',async({page,baseURL})=>{
 await page.goto('liveshow/');
 await expect(page.getByRole('status')).toContainText('Ready');
 const client=new Client({name:'studio-browser-test',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL('api/liveshow/mcp',baseURL)));
 const call=async(name:string,args:Record<string,unknown>={})=>{
   const result=await client.callTool({name,arguments:args});
   if(result.isError)throw new Error(JSON.stringify(result.content));
   return JSON.parse((result.content as {type:string;text:string}[]).find(block=>block.type==='text')!.text);
 };
 try{
  await expect.poll(async()=>{try{return(await call('get_chart_state')).revision;}catch{return -1;}}).toBe(0);
  const before=await call('get_chart_state');expect(before.sourceRows).toHaveLength(4);
  const tools=await client.listTools();expect(tools.tools.map(tool=>tool.name)).toContain('edit_chart');expect(tools.tools.map(tool=>tool.name)).not.toContain('apply_chart_proposal');
  const changed=await call('edit_chart',{revision:before.revision,edits:[{method:'color',args:[{value:'blue'}]},{method:'flip',args:[]}]});
  expect(changed.receipt.status).toBe('applied');expect(changed.spec.encoding.x.field).toBe('revenue');expect(changed.spec.encoding.color.value).toBe('blue');
  await expect(page.locator('.liveshow-chart .vd-bar')).toHaveCount(4);
  const state=await call('get_chart_state');expect(state.revision).toBe(changed.receipt.revision);
  const invalid=await client.callTool({name:'edit_chart',arguments:{revision:state.revision,edits:[{method:'color',args:[{value:'red'}]},{method:'x',args:['missing']}]}});
  expect(invalid.isError).toBe(true);expect((await call('get_chart_state')).revision).toBe(state.revision);
  const stale=await client.callTool({name:'edit_chart',arguments:{revision:0,edits:[{method:'flip',args:[]}]}});expect(stale.isError).toBe(true);
  const inspected=await call('inspect_marks');expect(inspected.marks).toHaveLength(4);
  const image=await client.callTool({name:'capture_chart',arguments:{}});expect(image.isError).not.toBe(true);expect((image.content as {type:string}[]).some(block=>block.type==='image')).toBe(true);
  const undone=await call('restore_chart',{revision:state.revision,action:'undo'});expect(undone.receipt.status).toBe('applied');expect(undone.spec.encoding.y.field).toBe('revenue');
  expect(await page.locator('.liveshow-chart .vd-axis-ghost').count()).toBe(0);
 }finally{await client.close();}
});
