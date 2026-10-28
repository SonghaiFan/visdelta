'use client';
import { useEffect, useState } from 'react';
import { storyAppUrl } from '@/lib/shared';
type Draft = { version: 1; story: string; code: string; rows: string };
const isDraft = (value: unknown): value is Draft => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Draft>;
  return item.version === 1 && typeof item.story === 'string' && typeof item.code === 'string' && typeof item.rows === 'string';
};
export function StoryEntry() {
  const [href, setHref] = useState(storyAppUrl);
  const [drafts, setDrafts] = useState<[string, Draft][]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
    const url = new URL(storyAppUrl);
    url.search = location.search; url.hash = location.hash; setHref(url.href);
    try {
      const found: [string, Draft][] = [];
      const current = JSON.parse(localStorage.getItem('visdelta-story-draft-v1') ?? 'null');
      if (isDraft(current)) found.push(['current', current]);
      const saved = JSON.parse(localStorage.getItem('visdelta.story.example-drafts.v1') ?? '{}');
      for (const [id, value] of Object.entries(saved ?? {})) if (isDraft(value)) found.push([id, value]);
      setDrafts(found);
    } catch { setError('Some old drafts could not be read. Existing browser storage has been preserved.'); }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function download(name: string, doc: Draft) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: doc.version, story: doc.story, code: doc.code, rows: doc.rows }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `visdelta-story-${name}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="mx-auto w-full max-w-3xl px-6 py-16">
    <p className="mb-3 text-xs uppercase tracking-widest text-fd-muted-foreground">A VisDelta downstream application</p>
    <h1 className="mb-5 text-4xl font-semibold tracking-tight">VisDelta Story</h1>
    <p className="mb-6 leading-7">The MDX editor, scrolling narratives and interactive weather case study now live in an independent project built on VisDelta’s public API.</p>
    <a href={href} className="inline-flex rounded-sm bg-fd-primary px-4 py-2 text-sm text-fd-primary-foreground">Open Story Studio ↗</a>
    <p className="mt-4 text-sm"><a className="underline underline-offset-4" href={new URL('../docs/', storyAppUrl).href}>Read Story documentation ↗</a></p>
    <p className="mt-8 text-sm leading-7 text-fd-muted-foreground">Saved projects still open in Story. Browser drafts belong to the old website address: download them here, then use Open in the new editor. Your original drafts stay on this device.</p>
    {drafts.length > 0 && <div className="mt-4 flex flex-wrap gap-3" aria-label="Previous Story drafts">{drafts.map(([name, doc]) => <button key={name} className="rounded-sm border px-3 py-2 text-sm" onClick={() => download(name, doc)}>Download {name} draft</button>)}</div>}
    {error && <p role="alert" className="mt-4 text-sm">{error}</p>}
  </section>;
}
