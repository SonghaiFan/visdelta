import {createRenderer} from 'visdelta/render';
import {pointModule} from 'visdelta/point';
import {barModule} from 'visdelta/bar';
export const {render}=createRenderer({modules:[pointModule,barModule]});
