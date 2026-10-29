import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'VisDelta Liveshow', description: 'A real-time visualization workspace for AI agents, built on VisDelta.' };
export default function LiveshowPage() {
 return <main className="min-w-0 flex-1"><section className="mx-auto max-w-3xl px-6 py-16">
 <p className="mb-3 text-xs uppercase tracking-widest text-fd-muted-foreground">A VisDelta downstream application</p>
 <h1 className="mb-5 text-4xl font-semibold tracking-tight">VisDelta Liveshow</h1>
 <p className="mb-6 leading-7">Liveshow now lives in an independent project for AI-driven visualization updates. Edit JSON, animate an existing chart and explore rapid changes through VisDelta’s public API.</p>
 <a href="https://songhaifan.github.io/visdelta-liveshow/" className="inline-flex rounded-sm bg-fd-primary px-4 py-2 text-sm text-fd-primary-foreground">Open Liveshow ↗</a>
 <p className="mt-4 text-sm"><a className="underline underline-offset-4" href="https://github.com/SonghaiFan/visdelta-liveshow">Source and integration documentation ↗</a></p>
 <p className="mt-6 text-sm text-fd-muted-foreground">The demo currently uses local presets. Connect your own agent through the documented edit interface.</p>
 </section></main>;
}
