'use client';

import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/cn';
import { repositoryUrl } from '@/lib/shared';

const tools = [
  { href: '/playground', label: 'Playground' },
  { href: '/gallery', label: 'Gallery' },
];

/**
 * The studio's own app bar: Playground and Gallery are tools built on
 * VisDelta, outside the documentation's navigation.
 */
export function StudioHeader() {
  const pathname = usePathname().replace(/\/$/, '');
  return (
    <header className="sticky top-0 z-40 flex h-11 shrink-0 items-center gap-1 border-b bg-fd-background/95 px-3 backdrop-blur sm:gap-3">
      <Link href="/" className="mr-1 inline-flex items-center rounded-sm px-1 py-1 text-sm" aria-label="VisDelta home">
        <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="h-4 w-auto" />
          <span className="hidden sm:inline">VisDelta</span>
        </span>
      </Link>
      <span aria-hidden="true" className="vd-label hidden sm:inline">
        Studio
      </span>
      <nav aria-label="Studio" className="ml-1 flex items-center gap-0.5">
        {tools.map((tool) => {
          const active = pathname.endsWith(tool.href);
          return (
            <Link
              key={tool.href}
              href={tool.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-sm px-2 py-1 text-sm transition-colors',
                active ? 'bg-fd-accent text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground',
              )}
            >
              {tool.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-1 sm:gap-3">
        <Link href="/docs" className="px-1 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground">
          Docs
        </Link>
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="GitHub"
          className="hidden p-1 text-fd-muted-foreground transition-colors hover:text-fd-foreground sm:inline-flex"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4">
            <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1 .9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
          </svg>
        </a>
        <ThemeSwitch />
      </div>
    </header>
  );
}
