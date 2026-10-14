'use client';

import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/cn';
import { basePath, repositoryUrl } from '@/lib/shared';

const tools = [
  { href: '/', label: 'Home' },
  { href: '/docs', label: 'Docs' },
];
export function SiteHeader() {
  const pathname = usePathname().replace(new RegExp(`^${basePath}(?=/|$)`), '').replace(/\/$/, '');
  const studioViews = [
    { href: '/playground', label: 'Playground' },
    { href: '/gallery', label: 'Gallery' },
  ];
  const inStudio = pathname.startsWith('/playground') || pathname.startsWith('/gallery') || pathname.startsWith('/studio');
  return (
    <header className="vd-site-header sticky top-0 z-40 flex h-11 shrink-0 items-center gap-1 border-b bg-fd-background/95 px-1 backdrop-blur sm:gap-3 sm:px-3">
      <Link href="/" className="sm:mr-1 inline-flex items-center rounded-sm px-1 py-1 text-sm" aria-label="VisDelta home">
        <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="h-4 w-auto" />
          <span className="hidden sm:inline">VisDelta</span>
        </span>
      </Link>
      <nav aria-label="Main navigation" className="min-w-0 flex items-center gap-0.5">
        {tools.map((tool) => {
          const active = tool.label === 'Home' ? pathname === '' : pathname.startsWith('/docs');
          return (
            <Link
              key={tool.href}
              href={tool.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-sm px-1.5 py-1 text-sm transition-colors',
                active ? 'bg-fd-accent text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground',
              )}
            >
              {tool.label}
            </Link>
          );
        })}
        <div role="group" aria-label="Studio views" className="ml-1 inline-flex items-center gap-0.5 rounded-md border bg-fd-muted p-0.5">
          {studioViews.map(({ href, label }) => {
            const active = inStudio && (pathname === href || pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className="rounded-sm px-1.5 py-1 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground aria-[current=page]:bg-fd-background aria-[current=page]:text-fd-foreground aria-[current=page]:shadow-sm sm:px-3"
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="ml-auto shrink-0 flex items-center gap-1 sm:gap-3">
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
