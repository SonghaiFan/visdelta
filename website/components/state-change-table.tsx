import { categories } from '@/examples/registry';

/**
 * The closed vocabulary of `delta().stateChanges`. Actions mirror the
 * `StateChange` union in `src/types/index.ts`; public syntax lists existing
 * builder calls that commonly produce each category.
 */
const rows: Record<string, { actions: string[]; extra: string; syntax: string[] }> = {
  data: { actions: ['add', 'remove', 'update'], extra: '—', syntax: ['.where()', '.data()'] },
  grain: {
    actions: ['split', 'merge', 'reaggregate', 'change-reducer'],
    extra: 'previous, next',
    syntax: ['.breakdown()', '.rollup()', 'unit .value({ unitValue })'],
  },
  encoding: { actions: ['bind', 'unbind', 'remap'], extra: 'channel', syntax: ['.x()', '.y()', '.color(field)', '.size()', '.repeat()'] },
  coordinate: { actions: ['rescale', 'reorient'], extra: 'channel?', syntax: ['.flip()', 'scale / domain options'] },
  layout: { actions: ['reorder', 'rearrange', 'reconnect'], extra: '—', syntax: ['.sort()', '.layout()', '.connect()'] },
  attention: { actions: ['enter', 'exit', 'shift'], extra: 'target: focus | highlight', syntax: ['.focus()', '.highlight()'] },
  appearance: { actions: ['restyle', 'reshape'], extra: 'property', syntax: ['.color("#hex")', '.curve()', '.innerRadius()'] },
};

export function StateChangeTable() {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-fd-muted-foreground">
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Emitted actions</th>
            <th className="px-3 py-2 font-medium">Extra fields</th>
            <th className="px-3 py-2 font-medium">Public syntax</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const row = rows[category.id];
            return (
              <tr key={category.id} className="border-b align-top last:border-0">
                <td className="px-3 py-2.5" data-category={category.id}>
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="vd-category-dot" aria-hidden="true" />
                    {category.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-fd-muted-foreground">{category.summary}</span>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs">{row.actions.join(' · ')}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-fd-muted-foreground">{row.extra}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{row.syntax.join('  ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
