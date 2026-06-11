import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import appCss from '../styles.css?url'

// Update after deploy if the site gets a custom domain.
const SITE_URL = 'https://scroll-race.netlify.app'
const TITLE = 'Scroll Race — how fast can you scroll 100 feet?'
const DESCRIPTION =
  'A 100-foot ruler. A stopwatch. Your thumb. The world’s simplest racing game.'

// Zero-asset favicon: paper tile, ruler rail with ink ticks, orange descent
// arrow, checkered finish. (A 1200x630 public/og.png in this same paper/ink/
// orange language is the single image asset worth adding later for richer
// link unfurls.)
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f1e4c8"/><rect x="8" y="8" width="12" height="48" rx="2" fill="#e6d2a0"/><rect x="8" y="14" width="9" height="2.5" fill="#19231d"/><rect x="8" y="26" width="6" height="2.5" fill="#19231d"/><rect x="8" y="38" width="9" height="2.5" fill="#19231d"/><rect x="8" y="50" width="6" height="2.5" fill="#19231d"/><rect x="35" y="10" width="8" height="22" rx="2" fill="#e8472b"/><path d="M27 32 L39 50 L51 32 Z" fill="#e8472b"/><path d="M27 53h6v6h-6z M39 53h6v6h-6z" fill="#19231d"/></svg>`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        title: TITLE,
      },
      {
        name: 'description',
        content: DESCRIPTION,
      },
      {
        property: 'og:title',
        content: TITLE,
      },
      {
        property: 'og:description',
        content: DESCRIPTION,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:site_name',
        content: 'Scroll Race',
      },
      {
        property: 'og:url',
        content: SITE_URL,
      },
      {
        name: 'twitter:card',
        content: 'summary',
      },
      {
        name: 'twitter:title',
        content: TITLE,
      },
      {
        name: 'twitter:description',
        content: DESCRIPTION,
      },
      {
        name: 'theme-color',
        media: '(prefers-color-scheme: light)',
        content: '#f1e4c8',
      },
      {
        name: 'theme-color',
        media: '(prefers-color-scheme: dark)',
        content: '#141c18',
      },
    ],
    links: [
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`,
      },
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
      {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:opsz,wght@10..72,500;10..72,600;10..72,700;10..72,800;10..72,900&family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500&family=Spline+Sans+Mono:wght@500;600;700&display=swap',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
