import {render} from './runtime.mjs';
import {mount as mountCharts} from './mount.mjs';
import {states,distribution} from './chart.mjs';

const host=document.querySelector('#chart');
const position=document.querySelector('#position');
const metric=document.querySelector('#metric');
const threshold=document.querySelector('#threshold');
const status=document.querySelector('#status');
const steps=[...document.querySelectorAll('[data-step]')];
const rows=await fetch('./data.json').then(response=>{if(!response.ok)throw Error('Archive could not be loaded.');return response.json();});
let controller,summary,generation=0,frame,anchors=[],disposed=false;
function measure(){anchors=steps.map(step=>scrollY+step.getBoundingClientRect().top-innerHeight*.55);}
function seek(value){position.value=String(value);void controller?.seek(value).catch(error=>status.textContent=error.message);steps.forEach((step,index)=>step.setAttribute('aria-current',Math.round(value)===index?'step':'false'));}
function scroll(){if(frame)return;frame=requestAnimationFrame(()=>{frame=null;const end=anchors.findIndex(anchor=>scrollY<anchor);const index=end<0?4:Math.max(0,end-1);const fraction=index<4?Math.max(0,Math.min(1,(scrollY-anchors[index])/(anchors[index+1]-anchors[index]))):0;seek(matchMedia('(prefers-reduced-motion: reduce)').matches?Math.round(index+fraction):index+fraction);});}
async function build(){
  const revision=++generation;
  const summaryHost=document.querySelector('#distribution');
  const summaryMount=document.createElement('div');summaryHost.append(summaryMount);
  let next,nextSummary;summaryMount.style.visibility='hidden';
  const mount=document.createElement('div');mount.style.cssText='position:relative;width:100%;height:100%;visibility:hidden';host.append(mount);
  try{
    next=mountCharts(mount,states(rows,metric.value,Number(threshold.value)));
    await next.seek(Number(position.value));
    if(disposed||revision!==generation){next.destroy();mount.remove();summaryMount.remove();return;}
    nextSummary=await render(summaryMount,distribution(rows,metric.value,Number(threshold.value)),{width:'auto',height:280});
    if(disposed||revision!==generation){next.destroy();nextSummary.destroy();mount.remove();summaryMount.remove();return;}
    summary?.destroy();summaryHost.replaceChildren(summaryMount);summary=nextSummary;summaryMount.style.visibility='';
    controller?.destroy();host.replaceChildren(mount);controller=next;mount.style.visibility='';
    seek(Number(position.value));status.textContent=`${rows.filter(row=>row.metric===metric.value).length.toLocaleString()} archived days · ${metric.selectedOptions[0].text} · no imputation`;
    document.documentElement.dataset.storyReady='true';
  }catch(error){next?.destroy();mount.remove();nextSummary?.destroy();summaryMount.remove();if(revision===generation)status.textContent=error.message;}
}
position.addEventListener('input',()=>{const value=Number(position.value);seek(value);const index=Math.floor(value);scrollTo({top:index<4?anchors[index]+(value-index)*(anchors[index+1]-anchors[index]):anchors[4],behavior:'instant'});});
metric.addEventListener('change',()=>void build());
threshold.addEventListener('change',()=>void build());
threshold.addEventListener('input',()=>document.querySelector('#percentile').value=threshold.value);
addEventListener('scroll',scroll,{passive:true});
let width=host.clientWidth;
const resize=new ResizeObserver(()=>{if(host.clientWidth!==width){width=host.clientWidth;measure();controller?.resize();summary?.resize();scroll();}});resize.observe(host);
addEventListener('resize',measure);measure();await build();scroll();
addEventListener('pagehide',()=>{disposed=true;generation++;controller?.destroy();summary?.destroy();resize.disconnect();cancelAnimationFrame(frame);removeEventListener('scroll',scroll);removeEventListener('resize',measure);},{once:true});
