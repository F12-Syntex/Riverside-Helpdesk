import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import Notifications from './_components/Notifications';
import AuditTracker from './_components/AuditTracker';
import AppShell from './_components/AppShell';
import ShaderBackground from './_components/ShaderBackground';

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
        {/* The light behind every page (ShaderBackground), then every page
            inside the shell: the bar across the top, the tools in the middle
            of it, and which build this is at the foot of its menu, the corner
            somebody is asked to read out when they have been told a change
            is live and cannot see it. */}
        <ShaderBackground />
        <AppShell>{children}</AppShell>
        <Notifications />
        <AuditTracker />
        <Analytics />
      </body>
    </html>
  );
}
