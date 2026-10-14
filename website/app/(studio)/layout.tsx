/** Playground and Gallery share the global navigation and Studio view switcher. */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-44px)] flex-col">
      {children}
    </div>
  );
}
