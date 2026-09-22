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
    ['meta', { name: 'theme-color', content: '#f4f3ef' }],
    ['link', {
      rel: 'icon',
      href: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Cpath d="M12 16h18v12H12zM34 36h18v12H34z" fill="%23111"/%3E%3Cpath d="M26 22h12v20" fill="none" stroke="%232f64ff" stroke-width="5"/%3E%3C/svg%3E'
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
    nav: [
      { text: 'Start', link: '/getting-started' },
      { text: 'Ontology', link: '/language-framework' },
      { text: 'API', link: '/reference' },
      { text: 'Explore', items: [
        { text: 'Run a state difference', link: '/language-framework#run-a-state-difference' },
        { text: 'Chart types', link: '/chart-types' },
        { text: 'Data and transforms', link: '/data-sources-and-transforms' },
        { text: 'Transition runtime', link: '/runtime-api' },
        { text: 'Chart style', link: '/chart-style' }
      ] },
      { text: '0.3.0', items: [
        { text: 'Changelog', link: 'https://github.com/SonghaiFan/visdelta/blob/main/CHANGELOG.md' },
        { text: 'npm package', link: 'https://www.npmjs.com/package/visdelta' }
      ] }
    ],
    sidebar: [
      {
        text: 'Learn the model',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Ontology and contracts', link: '/language-framework' }
        ]
      },
      {
        text: 'Build a chart state',
        items: [
          { text: 'Data and transforms', link: '/data-sources-and-transforms' },
          { text: 'Chart types', link: '/chart-types' },
          { text: 'Appearance and style', link: '/chart-style' }
        ]
      },
      {
        text: 'Inspect and run a transition',
        items: [
          { text: 'Ontology playground', link: '/language-framework#run-a-state-difference' },
          { text: 'API reference', link: '/reference' },
          { text: 'Transition runtime', link: '/runtime-api' }
        ]
      },
      {
        text: 'Chart-specific labs',
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
      message: 'Built from the current repository. Released under the MIT License.',
      copyright: 'VisDelta documentation'
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next'
    }
  }
});
