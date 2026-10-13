import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import {
  createGenerator,
  remarkAutoTypeTable,
} from 'fumadocs-typescript';
import { resolve } from 'node:path';
import { codeThemes } from './lib/code-themes';

// This file is bundled into `.source/`, so resolve from the working directory
// (`website/`) rather than `import.meta.url`.
const repositoryRoot = resolve(process.cwd(), '..');

/**
 * Type tables are generated from the library's TypeScript source at build
 * time, so API reference pages cannot drift from the implementation.
 * `<auto-type-table path="src/transition.ts" name="TransitionOptions" />`
 * resolves `path` against the repository root.
 */
const typeGenerator = createGenerator({
  tsconfigPath: resolve(repositoryRoot, 'tsconfig.json'),
  // Do not persist type tables under .next: builds can remove that directory
  // while a dev worker is still generating a table. Keep the generator's
  // reusable TypeScript project without depending on disposable cache files.
});

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      [
        remarkAutoTypeTable,
        {
          generator: typeGenerator,
          options: { basePath: repositoryRoot },
          shiki: { themes: codeThemes },
          remarkStringify: true,
        },
      ],
    ],
    rehypeCodeOptions: {
      themes: codeThemes,
    },
  },
});
