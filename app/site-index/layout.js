/* ------------------------------------------------------------------ *
 * The page itself is a client component (it uses the shared style
 * helpers), and a client component cannot declare route metadata. This
 * server component exists to carry the title.
 * ------------------------------------------------------------------ */

export const metadata = {
  title: 'Full index — The Riverside Practice',
  description: 'Every page and API endpoint in the Riverside Practice helpdesk.',
};

export default function IndexLayout({ children }) {
  return children;
}
