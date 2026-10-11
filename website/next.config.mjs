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
  turbopack: { root: repositoryRoot },
  outputFileTracingRoot: repositoryRoot,
};

export default withMDX(config);
