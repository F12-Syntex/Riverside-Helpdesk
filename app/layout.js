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
        {/* Every page is inside the rail: the tools down the left, the crumb
            across the top, and which build this is at the foot of the rail —
            the corner somebody is asked to read out when they have been told
            a change is live and cannot see it. That badge used to float over
            the bottom right of every page; it is a labelled row in a fixed
            place now, which is the same job done without sitting on top of
            an answer. */}
        <AppShell>{children}</AppShell>
        <Notifications />
        <AuditTracker />
        <Analytics />
      </body>
    </html>
  );
}
