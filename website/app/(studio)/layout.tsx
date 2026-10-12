import { StudioHeader } from '@/components/studio/studio-header';

/** Playground and Gallery: full-screen tools with their own app bar. */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StudioHeader />
      {children}
    </div>
  );
}
