import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      nav={{ title: 'Documentation', url: '/docs' }}
      links={[]}
      githubUrl={undefined}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
