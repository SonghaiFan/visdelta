import DefaultTheme from 'vitepress/theme';
import { defineAsyncComponent, h } from 'vue';
import './custom.css';
import '../../../dist/visdelta.css';
import BarTransitionShowcase from '../components/BarTransitionShowcase.vue';
import HomeLiveStudio from '../components/HomeLiveStudio.vue';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'home-hero-image': () => h(BarTransitionShowcase, { variant: 'hero' })
  }),
  enhanceApp({ app }) {
    app.component('SyntaxPlayground', defineAsyncComponent(
      () => import('../components/SyntaxPlayground.vue')
    ));
    app.component('TransitionWorkbench', defineAsyncComponent(
      () => import('../components/TransitionWorkbench.vue')
    ));
    app.component('BarTransitionShowcase', BarTransitionShowcase);
    app.component('HomeLiveStudio', HomeLiveStudio);
    app.component('ChartStyleGallery', defineAsyncComponent(
      () => import('../components/ChartStyleGallery.vue')
    ));
  }
};
