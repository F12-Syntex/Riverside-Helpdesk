import './globals.css';
import Notifications from './_components/Notifications';

export const metadata = {
  title: 'The Riverside Practice Q&A bot',
  description: 'Practice Q&A for The Riverside Practice — answers for all staff, grounded only in the organisation’s own documents.',
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
      <body>{children}<Notifications /></body>
    </html>
  );
}
