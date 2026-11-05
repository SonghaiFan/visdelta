import {point} from 'visdelta/point';
import {bar} from 'visdelta/bar';

/** Tidy archived observations are supplied before constructing charts. */
export function states(rows,metric,threshold) {
  const base=point(rows.filter(row=>row.metric===metric)).key('id').datumKey('id')
    .x('calendar_day',{label:'Seasonal day (January 31–February 14)',format:'d'})
    .y('temperature',{label:'Temperature (°C)'})
    .color('series',{domain:['2009','Other years'],range:['#dc532d','#b9bec4']})
    .pointSize(2.8).tooltip(['date','temperature','percentile','source']);
  const extreme=base.where({percentile:{gte:threshold}});
  return [base,base.highlight({year:2009}),extreme,
    extreme.x('year',{label:'Year',format:'d'}),
    extreme.x('temperature',{label:'Temperature (°C)'}).y('year',{label:'Year',format:'d'})];
}

export function distribution(rows,metric,threshold){
  return bar(rows.filter(row=>row.metric===metric)).datumKey('id').where({percentile:{gte:threshold}})
    .x('bin',{label:'Temperature bin (°C), width 0.5°C'}).y('one',{label:'Archived days'})
    .rollup({op:'sum',label:'Archived days'}).sort('bin');
}
