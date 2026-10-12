import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import {
  createFileSystemGeneratorCache,
  createGenerator,
  remarkAutoTypeTable,
} from 'fumadocs-typescript';
import { resolve } from 'node:path';
import { codeThemes } from './lib/code-themes';
import { remarkSourceRef } from './lib/remark-source-ref';

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
  cache: createFileSystemGeneratorCache('.next/fumadocs-typescript'),
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

// `next dev` only: lets the inline editor map rendered blocks to their source.
const editable = process.env.NODE_ENV === 'development';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      ...(editable ? [remarkSourceRef] : []),
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
