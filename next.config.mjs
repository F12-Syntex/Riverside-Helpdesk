/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The deep index is served at /index, but its files live in app/site-index.
  //
  // "index" is a reserved route name to the App Router: it normalises /index
  // back to / internally, and a page directory of that name fails the build
  // with "Cannot read properties of undefined (reading 'clientModules')". So
  // the page is built under a name Next accepts and rewritten onto the address
  // staff are actually given — the URL in the browser stays /index. The
  // redirect keeps that the only address; without it the same page would answer
  // to two, and the audit log would record it as two different pages.
  async rewrites() {
    return [{ source: '/index', destination: '/site-index' }];
  },
  async redirects() {
    return [{ source: '/site-index', destination: '/index', permanent: true }];
  },

  experimental: {
    // Ensure the baseline supplementary-context notes ship with the /api/ask
    // function so they can be read at runtime. (The Notebook and configured URLs
    // need no bundling and update without a redeploy.)
    outputFileTracingIncludes: {
      '/api/ask': ['./rag/context/**/*', './rag/processed/*', './lib/*.data.json', './lib/lookup/*.data.json'],
      '/api/directory': ['./rag/processed/*', './lib/*.data.json', './lib/lookup/*.data.json'],
      '/api/kb': ['./rag/processed/*', './lib/*.data.json', './lib/lookup/*.data.json'],
      // The CQC dataset is read from disk (gzipped) rather than bundled, so it
      // has to be traced in explicitly.
      '/api/cqc': ['./lib/lookup/cqc.data.json.gz'],
    },
  },
};

export default nextConfig;
