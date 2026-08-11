import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import Notifications from './_components/Notifications';
import AuditTracker from './_components/AuditTracker';
import { BUILD_LABEL, VERSION_LABEL } from '@/lib/version.mjs';

export const metadata = {
  title: 'The Riverside Practice Q&A bot',
  description: 'Practice Q&A for The Riverside Practice. Answers for all staff, based only on the organisation’s own documents.',
  icons: { icon: '/assets/logo.png', shortcut: '/assets/logo.png', apple: '/assets/logo.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* Which build this is, in the corner and out of the way. It exists for
            one exchange: somebody is told a change is live, cannot see it, and
            needs to say what they are actually looking at. Fixed rather than in
            the page flow so it never pushes an answer around, and pointer-events
            off so it can never be the thing a finger lands on. */}
        <span
          title={BUILD_LABEL}
          style={{
            position: 'fixed',
            right: '8px',
            bottom: '6px',
            zIndex: 1,
            pointerEvents: 'none',
            fontSize: '10.5px',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '.02em',
            color: '#c3ccd1',
            userSelect: 'none',
          }}
        >
          {VERSION_LABEL}
        </span>
        <Notifications />
        <AuditTracker />
        <Analytics />
      </body>
    </html>
  );
}
