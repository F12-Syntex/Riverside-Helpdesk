import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import Notifications from './_components/Notifications';
import AuditTracker from './_components/AuditTracker';
import AppShell from './_components/AppShell';

export const metadata = {
  title: 'The Riverside Practice Q&A bot',
  description: 'Practice Q&A for The Riverside Practice. Answers for all staff, based only on the organisation’s own documents.',
  icons: { icon: '/assets/logo.png', shortcut: '/assets/logo.png', apple: '/assets/logo.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // The chrome around the page — the browser's own address bar and the
  // phone's status bar — is told the app is dark, so it stops framing a
  // near-black page in white.
  themeColor: '#0b0b0c',
  colorScheme: 'dark',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Inter for the interface: at 13px in a rail, in a crumb and in a
            column of figures, the thing that matters is that the letters
            stay apart and the numerals line up. Hanken Grotesk stays as
            the fallback, so nothing reflows into a serif if the request
            for Inter never lands. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Every page is inside the rail: the tools down the left, the crumb
            across the top, and which build this is at the foot of the rail —
            the corner somebody is asked to read out when they have been told
            a change is live and cannot see it. */}
        <AppShell>{children}</AppShell>
        <Notifications />
        <AuditTracker />
        <Analytics />
      </body>
    </html>
  );
}
