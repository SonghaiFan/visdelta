import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    // The sidebar tree already lists every section, so drop the top-level links.
    <DocsLayout tree={source.getPageTree()} {...baseOptions()} links={[]}>
      {children}
    </DocsLayout>
  );
}
