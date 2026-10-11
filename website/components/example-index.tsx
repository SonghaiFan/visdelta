import Link from 'next/link';
import { categories, registry } from '@/examples/registry';

/** Every registered example, grouped by its primary state-change category. */
export function ExampleIndex() {
  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      {categories.map((category) => {
        const entries = registry.filter((entry) => entry.category === category.id);
        if (!entries.length) return null;
        return (
          <section key={category.id} data-category={category.id}>
            <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
              <span className="vd-category-dot" aria-hidden="true" />
              {category.label}
            </h3>
            <ul className="divide-y rounded-lg border">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/docs/examples/playground#${entry.id}`}
                    className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-fd-accent/50"
                  >
                    <span>{entry.title}</span>
                    <span className="font-mono text-xs uppercase tracking-wider text-fd-muted-foreground">
                      {entry.chart}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
