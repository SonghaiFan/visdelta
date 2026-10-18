import type { ComponentProps, ElementType } from 'react';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import type { MDXComponents } from 'mdx/types';
import { basePath } from '@/lib/shared';
import { BarGrainDemo } from '@/components/demos/bar-grain-demo';
import { ChartStyleGallery } from '@/components/demos/chart-style-gallery';
import { DesignComparisons } from '@/components/demos/design-comparisons';
import { RepeatDemo } from '@/components/demos/repeat-demo';
import { StateChangeCatalogue } from '@/components/demos/state-change-catalogue';
import { TransitionWorkbench } from '@/components/demos/transition-workbench';
import { LiveExample } from '@/components/live/live-example';

/** Preserve page-relative doc links while exported files use ordinary
 * navigation: they have no Next route payload to prefetch. */
function createMarkdownLink(Link: ElementType<ComponentProps<'a'>>) {
  return function MarkdownLink(props: ComponentProps<'a'>) {
    const href = props.href;
    const path = href?.split(/[?#]/)[0] ?? '';
    const isLocal = href && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href);
    // Relative Markdown references belong to Fumadocs; /llms.mdx/.../content.md
    // is instead an explicitly exported machine-readable file.
    const isDocSource = /\.mdx?$/i.test(path) && !path.startsWith('/llms.mdx/');
    if (href && isLocal && /\.[a-z\d]+$/i.test(path) && !isDocSource) {
      const target = href.startsWith('/') && !href.startsWith(`${basePath}/`)
        ? `${basePath}${href}` : href;
      return <a {...props} href={target} />;
    }
    return <Link {...props} />;
  };
}

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
    a: createMarkdownLink((components?.a ?? defaultMdxComponents.a) as ElementType<ComponentProps<'a'>>),
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
