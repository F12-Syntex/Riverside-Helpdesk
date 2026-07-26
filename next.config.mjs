/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
