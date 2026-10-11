import {test, expect} from '@playwright/test';

test('repeat reserves one canvas, opts into height, and rebuilds true frames at retained progress on resize', async ({page}) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const {line} = await import('/dist/line.js');
    const {transition} = await import('/dist/transition-entry.js');
    const rows = ['A','B','C'].flatMap((series,j) => [1,2,3,4].map((x,i)=>({series,x,y:10+j*20+i*3})));
    const a = line(rows).x('x').y('y').breakdown('series').color('series').key(['series','x']).pointSize(3);
    const host = document.querySelector('#chart'); host.style.width='900px';
    const height = () => host.querySelector('svg').viewBox.baseVal.height;
    const wait = () => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const snapshot = target => [...target.querySelectorAll('circle.vd-line-point')].map(n=>{
      const p=new DOMPoint(+n.getAttribute('cx'),+n.getAttribute('cy')).matrixTransform(n.getCTM());
      return [n.dataset.key,p.x,p.y,+n.getAttribute('r')];
    }).sort((a,b)=>a[0].localeCompare(b[0]));
    const truth = () => {
      for(const panel of host.querySelectorAll('.vd-facet-panel')) {
        const ticks=[...panel.querySelectorAll('.vd-facet-y-axis .tick')].filter(n=>+getComputedStyle(n).opacity>.001).map(n=>({value:+n.__data__,y:new DOMPoint(0,devicePixelRatio>1?0:-.5).matrixTransform(n.getCTM()).y})).sort((a,b)=>a.value-b.value);
        if(ticks.length<2) throw Error('Insufficient scale evidence');
        const low=ticks[0],high=ticks.at(-1),slope=(high.y-low.y)/(high.value-low.value);
        for(const tick of ticks)if(Math.abs(tick.y-low.y-(tick.value-low.value)*slope)>.02)throw Error('Ticks disagree');
        for(const mark of panel.querySelectorAll('circle.vd-line-point')) {
          const m=mark.getCTM(),p=new DOMPoint(+mark.getAttribute('cx'),+mark.getAttribute('cy')).matrixTransform(m);
          if(Math.abs(p.y-low.y-(mark.__data__.y-low.value)*slope)>.02)throw Error('Data and scale disagree after resize');
          if(Math.abs(m.a-1)>.001||Math.abs(m.d-1)>.001)throw Error('SVG stretched');
        }
      }
    };
    const b=a.repeat('series',{direction:'y',scales:'independent'});
    const fixed=await transition(a,b,{target:host});
    const fixedHeights=[0,.375,1].map(p=>{fixed.progress(p);return height();});fixed.destroy();
    const auto=a.repeat('series',{direction:'grid',autoHeight:true,minHeight:220});
    const motion=await transition(a,auto,{target:host});
    const reservedHeights=[0,.375,1].map(p=>{motion.progress(p);return height();});
    const compare=document.createElement('div');document.body.append(compare);
    const cases=[];
    for(const p of [.125,.375,.75,1,0]) {
      motion.progress(p);
      for(const width of [390,900]) {
        host.style.width=width+'px';await wait();
        if(motion.value!==p)throw Error('Resize changed progress');
        if(p>0&&p<1)truth();
        compare.style.width=host.style.width;
        const independent=await transition(a,auto,{target:compare});independent.progress(p);
        const actual=snapshot(host),expected=snapshot(compare);
        if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Resize differs from independent frame at '+p);
        cases.push({p,width,height:height()});independent.destroy();
      }
    }
    motion.play({from:1,to:0,duration:500});await wait();
    const before=motion.value;host.style.width='600px';await wait();const after=motion.value;
    if(after>before||after===1)throw Error('Resize restarted reverse playback');
    motion.pause();truth();motion.destroy();compare.remove();
    const explicit=await transition(a,auto,{target:host,height:420});explicit.progress(1);const authoredHeight=height();explicit.destroy();
    return {fixedHeights,reservedHeights,cases,authoredHeight};
  });
  expect(result.fixedHeights).toEqual([500,500,500]);
  expect(new Set(result.reservedHeights).size).toBe(1);
  expect(result.reservedHeights[0]).toBeGreaterThan(500);
  expect(result.cases.find(c=>c.width===390).height).toBeGreaterThan(result.cases.find(c=>c.width===900).height);
  expect(result.authoredHeight).toBe(420);
});


test('custom cached plugins reserve chart-owned height and resize without losing the playback clock', async ({page}) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result=await page.evaluate(async()=>{
    const {defineChartType,defineChartModule,ChartState,motion}=await import('/dist/plugins.js');
    const {transition}=await import('/dist/transition-entry.js');
    const key='resize-probe';
    const plugin=defineChartType({key,transitionEvaluation:'cached',
      defaultHeight:(spec,viewport)=>spec.encoding?.x?.field==='large'?viewport.height+100:viewport.height,
      createRenderer:()=>chart=>{
        const circle=chart.g.selectAll('circle.probe').data([1]).join('circle').attr('class','probe').attr('r',3);
        motion(circle,chart.transition.base).attr('cx',chart.innerWidth/2).attr('cy',chart.innerHeight/2);
      }
    });
    const module=defineChartModule({key,load:async()=>({plugin})});
    class Probe extends ChartState {chartModule(){return module;}}
    const a=new Probe({mark:key,data:{values:[{id:1,small:1,large:2}]},encoding:{x:{field:'small',type:'quantitative'}}});
    const b=a.with({encoding:{x:{field:'large',type:'quantitative'}}});
    const host=document.querySelector('#chart');host.style.width='800px';
    const compare=document.createElement('div');document.body.append(compare);
    const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const frame=target=>{
      const n=target.querySelector('circle.probe');const p=new DOMPoint(+n.getAttribute('cx'),+n.getAttribute('cy')).matrixTransform(n.getCTM());
      return [p.x,p.y,target.querySelector('svg').viewBox.baseVal.height];
    };
    const t=await transition(a,b,{target:host});
    const heights=[0,.5,1].map(p=>{t.progress(p);return frame(host)[2];});
    t.progress(.375);host.style.width='390px';await wait();
    const retained=t.value,actual=frame(host);
    for(const height of [0, -1, NaN, Infinity]) {
      let rejected=false;try {t.resize({height});}catch {rejected=true;}
      if(!rejected)throw Error('Invalid resize height accepted');
    }compare.style.width=host.style.width;
    const independent=await transition(a,b,{target:compare});independent.progress(.375);const expected=frame(compare);independent.destroy();
    t.resize({height:740});if(t.value!==.375||frame(host)[2]!==740)throw Error('Explicit height lost progress');
    t.play({from:.375,to:1,duration:500});await wait();const before=t.value;
    host.style.width='900px';await wait();const after=t.value;t.pause();t.destroy();
    host.style.width='700px';await wait();compare.remove();
    return {heights,retained,actual,expected,before,after};
  });
  expect(result.heights).toEqual([600,600,600]);
  expect(result.retained).toBe(.375);
  expect(result.actual).toEqual(result.expected);
  expect(result.after).toBeGreaterThanOrEqual(result.before);
  expect(result.after).toBeLessThan(1);
});
