'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { StateChangeIcon } from '@/components/interactive/state-change-icon';
import { categories, type StateChangeCategory } from '@/examples/registry';
import { cn } from '@/lib/cn';
import type { PlaygroundDemo } from './demos';

interface ExplorerProps {
  stories: PlaygroundDemo[];
  /** The story in the editor, if it is a curated one. */
  activeId?: string;
  activeCategory?: StateChangeCategory;
  onOpen: (story: PlaygroundDemo) => void;
}

/**
 * The playground's examples, filed like a project tree: the seven state-change
 * categories are the folders, and each story is a file in one of them.
 */
export function Explorer({ stories, activeId, activeCategory, onOpen }: ExplorerProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<StateChangeCategory>>(new Set());
  const toggle = (id: StateChangeCategory) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <nav aria-label="Examples" className="flex min-h-0 flex-col">
      <p className="vd-label flex h-9 shrink-0 items-center px-3">Examples</p>
      <ul className="min-h-0 flex-1 overflow-y-auto pb-3 text-[0.8125rem]">
        {categories.map((category) => {
          const open = !collapsed.has(category.id);
          const current = category.id === activeCategory;
          return (
            <li key={category.id}>
              <button
                type="button"
                aria-expanded={open}
                title={category.summary}
                onClick={() => toggle(category.id)}
                className={cn(
                  'flex h-7 w-full items-center gap-1.5 px-2 text-left transition-colors hover:bg-fd-accent',
                  current ? 'text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground',
                )}
              >
                <ChevronRight aria-hidden="true" className={cn('size-3 shrink-0 transition-transform duration-200', open && 'rotate-90')} />
                <StateChangeIcon category={category.id} className="size-3.5 shrink-0" />
                <span className="font-medium">{category.label}</span>
              </button>
              {open && (
                <ul>
                  {stories
                    .filter((story) => story.category === category.id)
                    .map((story) => {
                      const active = story.id === activeId;
                      return (
                        <li key={story.id}>
                          <button
                            type="button"
                            aria-current={active ? 'page' : undefined}
                            onClick={() => onOpen(story)}
                            className={cn(
                              'relative flex h-7 w-full items-center gap-2 pr-3 pl-[2.375rem] text-left transition-colors',
                              active ? 'bg-fd-accent text-fd-foreground' : 'text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground',
                            )}
                          >
                            {active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-[var(--color-delta)]" />}
                            <span className="truncate">{story.title}</span>
                            <span aria-hidden="true" className="ml-auto font-mono text-[0.65rem] opacity-70">
                              {story.chart}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
