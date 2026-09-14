import { defineConfig } from 'vitepress';

// The default works when the repository is served by a plain static server.
// Deployments can override it, for example DOCS_BASE=/visdelta/ for GitHub
// Pages. VitePress is an HTTP application; direct file:// use is unsupported.
const base = process.env.DOCS_BASE || '/docs/.vitepress/dist/';

export default defineConfig({
  title: 'VisDelta',
  description: 'Declarative visualization states and seekable animated transitions.',
  lang: 'en-US',
  base,
  cleanUrls: false,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#fbfbf8' }],
    ['link', {
      rel: 'icon',
      href: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect x="8" y="20" width="14" height="34" rx="4" fill="%231c6ae4"/%3E%3Crect x="26" y="10" width="14" height="44" rx="4" fill="%23fa4d1d"/%3E%3Crect x="44" y="28" width="14" height="26" rx="4" fill="%2303b976"/%3E%3C/svg%3E'
    }]
  ],
  markdown: {
    lineNumbers: true
  },
  themeConfig: {
    siteTitle: 'VisDelta',
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Playground', link: '/examples' },
      { text: 'API', link: '/reference' },
      { text: 'Learn', items: [
        { text: 'Design principles', link: '/language-framework' },
        { text: 'Chart types', link: '/chart-types' },
        { text: 'Data and transforms', link: '/data-sources-and-transforms' },
        { text: 'Chart styling', link: '/chart-style' }
      ] },
      { text: '0.2.0', items: [
        { text: 'Changelog', link: 'https://github.com/SonghaiFan/visdelta/blob/main/CHANGELOG.md' },
        { text: 'npm package', link: 'https://www.npmjs.com/package/visdelta' }
      ] }
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Interactive reference', link: '/reference' },
          { text: 'Examples', link: '/examples' }
        ]
      },
      {
        text: 'Learn',
        items: [
          { text: 'Design principles', link: '/language-framework' },
          { text: 'Chart types', link: '/chart-types' },
          { text: 'Data and transforms', link: '/data-sources-and-transforms' },
          { text: 'Chart style', link: '/chart-style' },
          { text: 'Transition regression log', link: '/transition-regression-log' },
          { text: 'Transition runtime', link: '/runtime-api' }
        ]
      },
      {
        text: 'Playground',
        items: [
          { text: 'Bar transition lab', link: '/transition-lab' },
          { text: 'Point transition lab', link: '/point-lab' },
          { text: 'Line transition lab', link: '/line-lab' },
          { text: 'Area transition lab', link: '/area-lab' },
          { text: 'Unit transition lab', link: '/unit-lab' }
        ]
      },
      {
        text: 'Integration',
        items: [
          { text: 'Add a chart type', link: '/extending-with-plugins' },
          { text: 'Use a CDN', link: '/for-cdn-users' }
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
      message: 'Released under the MIT License.',
      copyright: 'VisDelta 0.2 documentation'
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next'
    }
  }
});
