import {bar} from 'visdelta/bar';

// Regression fixture for explicit fold pipelines; demonstrations start with tidy rows.
export const foldedBar = bar({name:'sales'}).x('measure').y('amount',{label:'Revenue ($k)'})
  .with({transform:[{fold:{fields:['revenue'],as:['measure','amount']}}]})
  .breakdown('product').color('product').flip();
