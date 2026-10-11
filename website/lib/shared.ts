import { createGetUrl } from 'fumadocs-core/source';
import libraryPackage from '../../package.json';

export const appName = 'VisDelta';
export const appDescription =
  'Declare two immutable chart states. VisDelta reports what changed and renders one seekable transition you can play, reverse or scrub.';

/** Deployed origin plus base path, used for canonical URLs and the sitemap. */
export const siteUrl = (
  process.env.SITE_URL ?? 'https://songhaifan.github.io/visdelta'
).replace(/\/$/, '');

/** Next.js applies this automatically to links; raw asset URLs need it too. */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Read from the library manifest so install snippets never drift. */
export const libraryVersion: string = libraryPackage.version;

export const docsRoute = '/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'SonghaiFan',
  repo: 'visdelta',
  branch: 'main',
};

export const repositoryUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

/**
 * Absolute URL on the deployed site. Pages end with a slash (the export uses
 * `trailingSlash`); files such as `llms.txt` keep their extension.
 */
export function absoluteUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const isFile = /\.[a-z0-9]+$/i.test(normalized);
  return `${siteUrl}${isFile || normalized.endsWith('/') ? normalized : `${normalized}/`}`;
}
