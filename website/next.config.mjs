import { createMDX } from 'fumadocs-mdx/next';
import { fileURLToPath } from 'node:url';

const withMDX = createMDX();

// The live examples import the library from `../dist` through the `file:..`
// dependency, so the bundler must be allowed to resolve the repository root.
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

// GitHub Pages serves the site from /visdelta/. Local builds default to the
// domain root so `npm run dev` and `npm start` work without configuration.
const basePath = process.env.DOCS_BASE_PATH?.replace(/\/$/, '') ?? '';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  basePath,
  // Every page becomes `<path>/index.html`. GitHub Pages then resolves
  // `/docs/api` and its child `/docs/api/transition` without ambiguity.
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Next blocks dev resources (including the client bundle's hot-reload socket)
  // requested from an origin it does not list. Opened as 127.0.0.1 rather than
  // localhost, no page hydrates and the playground never leaves "Loading".
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: {
    root: repositoryRoot,
    // Fumadocs uses the valid Custom Highlight API for search results. The
    // bundled CSS parser does not recognize it yet; keep other issues visible.
    ignoreIssue: [
      {
        path: '**/app/global.css',
        title: 'Parsing CSS source code failed',
        description: /'highlight' is not recognized as a valid pseudo-element/,
      },
    ],
  },
  outputFileTracingRoot: repositoryRoot,
};

export default withMDX(config);
