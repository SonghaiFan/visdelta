import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import type { MDXComponents } from 'mdx/types';
import { BarGrainDemo } from '@/components/demos/bar-grain-demo';
import { ChartStyleGallery } from '@/components/demos/chart-style-gallery';
import { DesignComparisons } from '@/components/demos/design-comparisons';
import { RepeatDemo } from '@/components/demos/repeat-demo';
import { StateChangeCatalogue } from '@/components/demos/state-change-catalogue';
import { TransitionWorkbench } from '@/components/demos/transition-workbench';
import { LiveExample } from '@/components/live/live-example';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
    BarGrainDemo,
    ChartStyleGallery,
    DesignComparisons,
    LiveExample,
    RepeatDemo,
    StateChangeCatalogue,
    TransitionWorkbench,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
