import {basePath} from '@/lib/shared';
const examples=[
  {id:'network',title:'One route becomes a network',description:'A single HTML file: native chart states, scroll, scrubbing, reduced motion and cleanup.'},
  {id:'weather',title:'One hot day, a century of context',description:'The archived Melbourne case: tidy observations, linked prose and a cached sequence of keyed dots.'},
];
export function StoryEntry(){return <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
  <p className="mb-3 text-xs uppercase tracking-widest text-fd-muted-foreground">VisDelta Studio · Story</p>
  <h1 className="mb-4 text-4xl font-semibold tracking-tight">Tell a story with a website.</h1>
  <p className="mb-10 max-w-2xl leading-7 text-fd-muted-foreground">Copy a complete example and make it your own. Ordinary HTML and JavaScript control the page; VisDelta renders the chart and its transitions.</p>
  <div className="grid gap-8 md:grid-cols-2">{examples.map(example=><article key={example.id} className="min-w-0 border">
    <div className="p-5"><h2 className="text-xl font-semibold">{example.title}</h2><p className="my-3 text-sm leading-6 text-fd-muted-foreground">{example.description}</p><div className="flex gap-4 text-sm underline underline-offset-4"><a href={`${basePath}/story/examples/${example.id}/index.html`}>Open website ↗</a><a href={`${basePath}/story/examples/${example.id}/source.txt`}>Read source ↗</a></div></div>
    <iframe loading="lazy" title={example.title} src={`${basePath}/story/examples/${example.id}/index.html`} className="h-[540px] w-full border-t" />
  </article>)}</div>
</section>;}
