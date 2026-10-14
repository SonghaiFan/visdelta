'use client';

import { useEffect, type ReactNode } from 'react';
import { PanelLeft } from 'lucide-react';
import {
  SidebarProvider, SidebarContent, SidebarDrawerContent, SidebarDrawerOverlay,
  SidebarViewport, SidebarCollapseTrigger, SidebarTrigger, useSidebar,
} from 'fumadocs-ui/components/sidebar/base';

export { SidebarProvider, useSidebar };

/** Use the same Fumadocs state, keyboard shortcut and drawer as Docs. */
export function StudioSidebarButton() {
  const { mode } = useSidebar();
  const Trigger = mode === 'drawer' ? SidebarTrigger : SidebarCollapseTrigger;
  return <Trigger className="pg-tool" title="Toggle sidebar"><PanelLeft className="size-4" /></Trigger>;
}

export function StudioSidebar({ title, children, floatingRestore = true }: { title: string; children: ReactNode; floatingRestore?: boolean }) {
  const { mode, open, setOpen } = useSidebar();
  useEffect(() => {
    if (mode !== 'drawer' || !open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [mode, open, setOpen]);
  const content = <>
    <div className="flex h-10 shrink-0 items-center justify-between border-b px-4 text-sm font-medium">
      <span>{title}</span><StudioSidebarButton />
    </div>
    <SidebarViewport>{children}</SidebarViewport>
  </>;
  return <>
    <SidebarContent>{({ ref, collapsed, hovered, ...handlers }) => (
      <div className="studio-sidebar-slot" {...handlers}>
        {collapsed && <div className="studio-sidebar-hover" />}
        <aside ref={ref} id="nd-sidebar" className="studio-sidebar" data-collapsed={collapsed} data-hovered={hovered} inert={collapsed && !hovered}>
          {content}
        </aside>
        {floatingRestore && collapsed && !hovered && <div className="studio-sidebar-restore"><StudioSidebarButton /></div>}
      </div>
    )}</SidebarContent>
    <SidebarDrawerOverlay className="studio-sidebar-overlay data-[state=open]:animate-fd-fade-in data-[state=closed]:animate-fd-fade-out" />
    <SidebarDrawerContent className="studio-sidebar-drawer data-[state=open]:animate-fd-sidebar-in data-[state=closed]:animate-fd-sidebar-out" inert={!open}>
      {content}
    </SidebarDrawerContent>
  </>;
}
