import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getExample } from '@/examples/registry';

/**
 * Turn an example module into the snippet a reader can paste into an app:
 * the module's own source, without `export`, plus the controller call that
 * the docs player makes on its behalf.
 */
export async function getExampleSource(id: string): Promise<string> {
  getExample(id);
  const raw = await readFile(join(process.cwd(), 'examples', `${id}.ts`), 'utf8');
  const isSequence = /export const states\b/.test(raw);
  const runtime = isSequence ? 'sequence' : 'transition';
  const lines = raw.replace(/^export const /gm, 'const ').trimEnd().split('\n');
  const lastImport = lines.reduce((last, line, index) => (line.startsWith('import ') ? index : last), -1);
  lines.splice(
    lastImport + 1,
    0,
    `import { ${runtime} } from 'visdelta/transition';`,
    `import 'visdelta/style.css';`,
  );
  const mount = isSequence
    ? [
        "const story = await sequence(states, { target: '#chart' });",
        'story.play({ duration: 800 }); // or story.progress(1.5)',
      ]
    : [
        "const change = await transition(from, to, { target: '#chart' });",
        'change.play({ duration: 800 }); // or change.progress(0.5)',
      ];
  return `${lines.join('\n')}\n\n${mount.join('\n')}\n`;
}
