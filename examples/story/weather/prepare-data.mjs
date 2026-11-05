// Run once when changing the archived example's seasonal window. This is data preparation, not chart code.
import {readFile,writeFile} from 'node:fs/promises';
const archive=JSON.parse(await readFile(new URL('./archive.json',import.meta.url),'utf8'));
const rows=archive.rows.map(values=>Object.fromEntries(archive.columns.map((column,index)=>[column,values[index]])))
  .filter(row=>row.date.slice(5)!=='02-29')
  .map(row=>({...row,year:Number(row.date.slice(0,4)),calendar_day:Math.round((Date.parse(`2001-${row.date.slice(5)}T00:00:00Z`)-Date.UTC(2001,0,1))/86400000)+1}))
  .filter(row=>Math.abs(row.calendar_day-38)<=7)
  .map(row=>({...row,id:`${row.date}-${row.metric}`,one:1,bin:Math.floor(row.temperature*2)/2,series:row.year===2009?'2009':'Other years'}));
await writeFile(new URL('./data.json',import.meta.url),JSON.stringify(rows)+'\n');
