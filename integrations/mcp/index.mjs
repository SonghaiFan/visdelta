import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';

/** Public VisDelta calls over a caller-owned browser bridge. No chart compiler. */
export function createChartMcpServer(bridge) {
  const server=new McpServer({name:'visdelta',version:'0.1.0'});
  const text=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
  const tool=(name,description,inputSchema,handler)=>server.registerTool(name,{description,inputSchema},async args=>text(await handler(args)));
  tool('get_chart_state','Read the accepted declaration, revision, capabilities and source rows.',{},()=>bridge.state());
  tool('inspect_marks','Read keyed marks and their rendered spatial order. Use before positional references.',{},()=>bridge.inspect());
  server.registerTool('capture_chart',{description:'Capture a PNG only when visual evidence is needed.',inputSchema:{}},async()=>{
    const image=await bridge.capture();
    return {content:[{type:'text',text:JSON.stringify({revision:image.revision,width:image.width,height:image.height})},{type:'image',mimeType:'image/png',data:image.dataUrl.split(',')[1]}]};
  });
  tool('edit_chart','Apply native VisDelta fluent calls as one batch, exactly like view.edit. Read capabilities for supported methods. Each call is {method,args}; use color args [{value:"blue"}] for literal color. The browser validates the entire candidate and returns its receipt.',{
    revision:z.number().int().nonnegative(),
    edits:z.array(z.object({method:z.string().min(1),args:z.array(z.unknown())}).strict()).min(1).max(32),
    summary:z.string().max(300).optional(),continueAfterApply:z.boolean().optional(),
  },args=>bridge.edit(args));
  tool('set_chart','Apply a complete ViewSpec through update or replace. Preserve data and unrelated intent.',{
    revision:z.number().int().nonnegative(),spec:z.record(z.string(),z.unknown()),summary:z.string().max(300).optional(),
  },args=>bridge.setChart(args));
  tool('search_visdelta_docs','Search the installed package documentation for current API syntax.',{query:z.string().min(1).max(200)},args=>bridge.docs(args.query));
  tool('get_design_advice','Read advisory visualization warnings; warnings never require approval.',{
    revision:z.number().int().nonnegative(),spec:z.record(z.string(),z.unknown()).optional(),goal:z.string().max(500).optional(),
  },args=>bridge.advice(args));
  tool('restore_chart','Reset, undo or redo an accepted declaration.',{
    revision:z.number().int().nonnegative(),action:z.enum(['reset','undo','redo']),summary:z.string().max(300).optional(),
  },args=>bridge.restore(args));
  tool('ask_user','Ask when the intended object or result is ambiguous.',{question:z.string().min(1).max(1200)},args=>bridge.ask(args.question));
  return server;
}
