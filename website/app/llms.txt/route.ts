import { docsLlms, source } from '@/lib/source';
import { absoluteUrl, appDescription, appName, getPageMarkdownUrl, siteUrl } from '@/lib/shared';

export const revalidate = false;

export async function GET() {
  const header = [
    `# ${appName}`,
    '',
    `> ${appDescription}`,
    '',
    `Links below point to the Markdown source of each page. The HTML pages live under ${siteUrl}/docs/, and the complete documentation is a single file at ${siteUrl}/llms-full.txt.`,
    '',
  ].join('\n');
  // Agents fetch these links directly, so point them at absolute Markdown URLs.
  const markdownByPage = new Map(
    source.getPages().map((page) => [page.url, absoluteUrl(getPageMarkdownUrl(page).url)]),
  );
  const index = (await docsLlms.index()).replace(
    /\]\((\/[^)\s]*)\)/g,
    (_, path: string) => `](${markdownByPage.get(path) ?? absoluteUrl(path)})`,
  );
  return new Response(`${header}\n${index}`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
