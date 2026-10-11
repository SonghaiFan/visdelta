import { test, expect } from '@playwright/test';

test('repeat containers stage complete plugin subtrees before child geometry', async ({page})=>{
  await page.goto('/tests/fixtures/isolated.html');
  const result=await page.evaluate(async()=>{
    const {defineChartType,defineChartModule,ChartState,motion}=await import('/dist/plugins.js');
    const {transition}=await import('/dist/transition-entry.js');
    const key='container-probe';
    const plugin=defineChartType({key,transitionEvaluation:'cached',createRenderer:()=> (chart,rows)=>{
      chart.g.selectAll('text.probe-label').data([1]).join('text').attr('class','probe-label').attr('x',10).attr('y',15).style('font-size','12px').text('Panel');
      const circles=chart.g.selectAll('circle.probe').data(rows,row=>row.id).join(enter=>enter.append('circle').attr('class','probe').attr('cx',0).attr('cy',20).attr('r',0));
      motion(circles,chart.transition.base).attr('cx',chart.innerWidth/2).attr('r',row=>row.value);
    }});
    const module=defineChartModule({key,load:async()=>({plugin})});
    class Probe extends ChartState {chartModule(){return module;}}
    const rows=[{panel:'A',id:'a',value:10},{panel:'B',id:'b',value:20}];
    const a=new Probe({mark:key,data:{values:rows},encoding:{}}).key('id').repeat('panel',{direction:'x'});
    const b=a.repeat('panel',{direction:'y'}).data(rows.map(row=>({...row,value:row.value*2})));
    const host=document.querySelector('#chart');host.style.width='800px';
    const capture=()=>[...host.querySelectorAll('.vd-facet-panel')].map(panel=>{
      const mark=panel.querySelector('circle.probe');const matrix=mark.getCTM();const point=new DOMPoint(+mark.getAttribute('cx'),+mark.getAttribute('cy')).matrixTransform(matrix);
      const bounds=panel.querySelector('.vd-facet-bounds');
      const label=panel.querySelector('text.probe-label');const textMatrix=label.getCTM();const textWidth=label.getComputedTextLength()*textMatrix.a;const textHeight=parseFloat(getComputedStyle(label).fontSize)*textMatrix.d;
      const position=panel.transform.baseVal.consolidate()?.matrix ?? {e:0,f:0};
      return {panelX:position.e,panelY:position.f,textWidth,textHeight,localX:+mark.getAttribute('cx'),radius:+mark.getAttribute('r'),x:point.x,y:point.y,scaleX:matrix.a,scaleY:matrix.d,width:+bounds.getAttribute('width'),height:+bounds.getAttribute('height'),transform:panel.getAttribute('transform')};
    });
    const change=await transition(a,b,{target:host,height:600});
    const frames=[0,.125,.25,.375,.5,.75,1].map(progress=>{change.progress(progress);return capture();});
    const samples=[.125,.375,.75].map(p=>{change.progress(p);return capture();});
    change.progress(.125);const owner=host.querySelector('circle.probe');change.progress(.375);const sameOwner=host.querySelector('circle.probe')===owner;change.destroy();
    const inverse=await transition(b,a,{target:host,height:600});const reverse=[.125,.375,.75].map(p=>{inverse.progress(1-p);return capture();});inverse.destroy();
    return {frames,samples,reverse,sameOwner};
  });
  for(const frame of result.frames){const [a,b]=frame;const yA=a.panelY,yB=b.panelY,xA=a.panelX,xB=b.panelX;expect(xA+a.width<=xB+.001||xB+b.width<=xA+.001||yA+a.height<=yB+.001||yB+b.height<=yA+.001).toBe(true);}
  expect(result.sameOwner).toBe(true);
  for(let i=0;i<2;i++){
    const frames=result.frames.map(frame=>frame[i]);
    for(const frame of frames.slice(1,5)){
      expect(frame.scaleX).toBeCloseTo(1,5);
      expect(frame.scaleY).toBeCloseTo(1,5);
      expect(frame.radius).toBeCloseTo(frames[0].radius,5);
    }
    for(const frame of frames){expect(frame.textWidth).toBeCloseTo(frames[0].textWidth,1);expect(frame.textHeight).toBeCloseTo(frames[0].textHeight,4);}
    expect(frames[2].localX).toBeCloseTo(frames[0].localX,5);
    expect(frames[3].localX).not.toBe(frames[2].localX);
    expect(frames[1].width).toBe(frames[0].width);
    expect(frames[2].height).toBe(frames[6].height);
    expect(frames[3].height).toBe(frames[6].height);
    expect(frames[4].transform).toBe(frames[6].transform);
    expect(frames[4].height).toBe(frames[6].height);
    expect(frames[5].radius).toBeGreaterThan(frames[0].radius);
    expect(frames[5].radius).toBeLessThan(frames[6].radius);
  }
  for(let p=0;p<3;p++)for(let i=0;i<2;i++)for(const attr of ['x','y','scaleX','scaleY','radius'])expect(result.reverse[p][i][attr]).toBeCloseTo(result.samples[p][i][attr],5);
});
