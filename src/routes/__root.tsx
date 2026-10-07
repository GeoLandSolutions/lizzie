import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { QrBadge } from '../components/QrBadge'
import appCss from '../styles.css?url'

const SITE_URL = 'https://lizzie.valuebase.ai/'
const OG_IMAGE = `${SITE_URL}og-image.jpg`
const TITLE = "The Landlord's Game (1906)"
const SHARE_TITLE = "The Landlord's Game — play the 1906 original Monopoly"
const DESCRIPTION =
  "Before Monopoly was stolen, Lizzie Magie's 1906 board game came with two rule sets: crush-and-dominate Monopoly, and a Land Value Tax mode where everyone wins together. Play it on the real antique board and flip the switch."

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: TITLE,
      },
      { name: 'description', content: DESCRIPTION },
      { name: 'theme-color', content: '#1d2a23' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Valuebase' },
      { property: 'og:url', content: SITE_URL },
      { property: 'og:title', content: SHARE_TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:type', content: 'image/jpeg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content:
          "The Landlord's Game in play: the 1906 Economic Game Co. board with four player tokens, a Public Treasury, and a Land Value Tax toggle.",
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: SHARE_TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'twitter:image', content: OG_IMAGE },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      { rel: 'canonical', href: SITE_URL },
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'apple-touch-icon', href: '/logo192.png' },
      { rel: 'manifest', href: '/manifest.json' },
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
        <QrBadge />
        <TanStackDevtools
          config={{
            position: 'bottom-left',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
