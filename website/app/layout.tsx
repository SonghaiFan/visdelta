import type { Metadata, Viewport } from 'next';
import { SiteHeader } from '@/components/site-header';
import { Provider } from '@/components/provider';
import { appDescription, appName, basePath, siteUrl } from '@/lib/shared';
import 'visdelta/style.css';
import './global.css';

export const metadata: Metadata = {
  metadataBase: new URL(`${siteUrl}/`),
  title: {
    default: `${appName} — seekable transitions between chart states`,
    template: `%s · ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  icons: { icon: `${basePath}/visdelta-logo.svg` },
  openGraph: {
    type: 'website',
    siteName: appName,
    title: appName,
    description: appDescription,
  },
  twitter: { card: 'summary' },
  alternates: {
    types: { 'text/plain': `${siteUrl}/llms.txt` },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e10' },
  ],
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans">
        <Provider><SiteHeader />{children}</Provider>
      </body>
    </html>
  );
}
