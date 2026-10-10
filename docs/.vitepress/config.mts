import { defineConfig } from 'vitepress';

// The default works when the repository is served by a plain static server.
// Deployments can override it, for example DOCS_BASE=/visdelta/ for GitHub
// Pages. VitePress is an HTTP application; direct file:// use is unsupported.
const base = process.env.DOCS_BASE || '/docs/.vitepress/dist/';

export default defineConfig({
  title: 'VisDelta',
  description: 'Compare immutable chart states, inspect what changed, and render a seekable transition.',
  lang: 'en-US',
  base,
  cleanUrls: false,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#f4f4f2' }],
    ['link', {
      rel: 'icon',
      type: 'image/svg+xml',
      href: `${base}visdelta-logo.svg`
    }]
  ],
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-dark',
      dark: 'github-dark'
    }
  },
  themeConfig: {
    siteTitle: 'VisDelta',
    logo: '/visdelta-logo.svg',
    // Four destinations: the live demo, the documentation (syntax and
    // philosophy), the editor, and the gallery of expressible idioms.
    nav: [
      { text: 'Home', link: '/', activeMatch: '^/$' },
      { text: 'Docs', link: '/overview', activeMatch: '^/(?!playground|gallery|$)' },
      { text: 'Playground', link: '/playground' },
      { text: 'Gallery', link: '/gallery' },
      { text: '0.3.0', items: [
        { text: 'Changelog', link: 'https://github.com/SonghaiFan/visdelta/blob/main/CHANGELOG.md' },
        { text: 'npm package', link: 'https://www.npmjs.com/package/visdelta' }
      ] }
    ],
    sidebar: [
      {
        text: 'Documentation',
        items: [
          { text: 'Overview', link: '/overview' },
          { text: 'Getting started', link: '/getting-started' }
        ]
      },
      {
        text: 'Philosophy',
        items: [
          { text: 'Ontology and contracts', link: '/language-framework' }
        ]
      },
      {
        text: 'Syntax',
        items: [
          { text: 'Data and transforms', link: '/data-sources-and-transforms' },
          { text: 'Chart types', link: '/chart-types' },
          { text: 'Appearance and style', link: '/chart-style' },
          { text: 'API reference', link: '/reference' }
        ]
      },
      {
        text: 'Chart behavior',
        collapsed: true,
        items: [
          { text: 'Bar', link: '/transition-lab' },
          { text: 'Line', link: '/line-lab' },
          { text: 'Area', link: '/area-lab' },
          { text: 'Point', link: '/point-lab' },
          { text: 'Unit', link: '/unit-lab' }
        ]
      },
      {
        text: 'Runtime',
        items: [
          { text: 'Transition runtime', link: '/runtime-api' }
        ]
      },
      {
        text: 'Integrate',
        items: [
          { text: 'Use a CDN', link: '/for-cdn-users' },
          { text: 'Add a chart type', link: '/extending-with-plugins' },
          { text: 'Site design tokens', link: '/design-tokens' }
        ]
      }
    ],
    search: {
      provider: 'local',
      options: {
        detailedView: true
      }
    },
    outline: {
      level: [2, 3],
      label: 'On this page'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/SonghaiFan/visdelta' }
    ],
    editLink: {
      pattern: 'https://github.com/SonghaiFan/visdelta/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'Built from the current repository. Released under the MIT License.',
      copyright: 'VisDelta documentation'
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next'
    }
  }
});
