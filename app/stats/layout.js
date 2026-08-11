/* ------------------------------------------------------------------ *
 * This page is kept off the tools index deliberately. Keeping it out of
 * search engines is the same intention carried one step further —
 * neither the questions staff asked nor who did what in the practice
 * belongs in an index if the app is ever served from a public address.
 *
 * This is a server component only so that these two exports exist; a
 * client component cannot declare route metadata.
 * ------------------------------------------------------------------ */

export const metadata = {
  title: 'Questions and activity — The Riverside Practice',
  description: 'Every question the assistant was asked with the answer it gave, and what has been done in the app.',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default function StatsLayout({ children }) {
  return children;
}
