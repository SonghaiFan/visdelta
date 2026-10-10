import DefaultTheme from 'vitepress/theme';
import { defineAsyncComponent } from 'vue';
import './custom.css';
import '../../../dist/visdelta.css';
import HeroTransitionDemo from '../components/HeroTransitionDemo.vue';
import ProductCode from '../components/ProductCode.vue';
import DocsCodeBlock from '../components/DocsCodeBlock.vue';
import GettingStartedDemo from '../components/GettingStartedDemo.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('OrbitPluginDemo', defineAsyncComponent(
      () => import('../components/OrbitPluginDemo.vue')
    ));
    app.component('SyntaxPlayground', defineAsyncComponent(
      () => import('../components/SyntaxPlayground.vue')
    ));
    app.component('ChartPlayground', defineAsyncComponent(
      () => import('../components/ChartPlayground.vue')
    ));
    app.component('TransitionWorkbench', defineAsyncComponent(
      () => import('../components/TransitionWorkbench.vue')
    ));
    app.component('BarGrainPlannerDemo', defineAsyncComponent(
      () => import('../components/BarGrainPlannerDemo.vue')
    ));
    app.component('HeroTransitionDemo', HeroTransitionDemo);
    app.component('ProductCode', ProductCode);
    app.component('DocsCodeBlock', DocsCodeBlock);
    app.component('GettingStartedDemo', GettingStartedDemo);
    app.component('StateChangeCatalogue', defineAsyncComponent(
      () => import('../components/StateChangeCatalogue.vue')
    ));
    app.component('IdiomGallery', defineAsyncComponent(
      () => import('../components/IdiomGallery.vue')
    ));
    app.component('DesignTokens', defineAsyncComponent(
      () => import('../components/DesignTokens.vue')
    ));
    app.component('ChartStyleGallery', defineAsyncComponent(
      () => import('../components/ChartStyleGallery.vue')
    ));
  }
};
