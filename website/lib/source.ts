import { llms, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/plugins/lucide-icons';
import { docs } from 'collections/server';
import { docsRoute } from './shared';

// See https://fumadocs.dev/docs/headless/source-api
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${page.data.description ? `> ${page.data.description}\n\n` : ''}${await page.data.getText('processed')}`,
});
