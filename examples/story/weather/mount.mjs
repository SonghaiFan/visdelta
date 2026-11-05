import {transition} from 'visdelta/transition';
import {render} from './runtime.mjs';

/** A case-local cache: prepare only the endpoint or pair the reader requests. */
export function mount(target,states){
  const cache=new Map();
  let disposed=false,ticket=0,active;
  const dimensions=()=>({width:target.clientWidth,height:target.clientHeight});
  function prepare(index,endpoint){
    const key=`${endpoint?'state':'leg'}:${index}`;
    if(cache.has(key))return cache.get(key);
    const host=document.createElement('div');host.dataset.active='false';host.setAttribute('aria-hidden','true');host.style.cssText='position:absolute;inset:0;visibility:hidden';target.append(host);
    const pending=(async()=>{
      try{
        const controller=endpoint?await render(host,states[index],dimensions()):await transition(states[index],states[index+1],{target:host,...dimensions()});
        if(disposed){controller.destroy();host.remove();return;}
        return {host,controller,endpoint};
      }catch(error){host.remove();cache.delete(key);throw error;}
    })();
    cache.set(key,pending);target.dataset.prepared=String(cache.size);return pending;
  }
  return {
    async seek(value){
      const revision=++ticket;
      const position=Math.max(0,Math.min(states.length-1,value));
      const index=Math.floor(position),endpoint=Number.isInteger(position);
      const next=await prepare(index,endpoint);
      if(!next||disposed||revision!==ticket)return;
      if(active&&active!==next){active.host.style.visibility='hidden';active.host.dataset.active='false';active.host.setAttribute('aria-hidden','true');}
      if(!endpoint)next.controller.progress(position-index);
      next.host.style.visibility='';next.host.dataset.active='true';next.host.removeAttribute('aria-hidden');active=next;target.dataset.position=String(position);
    },
    resize(){for(const pending of cache.values())void pending.then(value=>{if(!disposed)value?.controller.resize(dimensions());},()=>{});},
    destroy(){if(disposed)return;disposed=true;ticket++;for(const pending of cache.values())void pending.then(value=>{value?.controller.destroy();value?.host.remove();},()=>{});cache.clear();},
  };
}
