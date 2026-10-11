import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Wordmark } from '@/components/logo';
import { libraryVersion, repositoryUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Wordmark />,
      url: '/',
    },
    githubUrl: repositoryUrl,
    links: [
      { text: 'Documentation', url: '/docs', active: 'url' },
      { text: 'Playground', url: '/docs/examples/playground' },
      { text: 'API', url: '/docs/api', active: 'nested-url' },
      {
        text: `v${libraryVersion}`,
        url: `${repositoryUrl}/blob/main/CHANGELOG.md`,
        external: true,
        on: 'menu',
      },
    ],
  };
}
