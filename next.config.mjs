/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Ensure the baseline supplementary-context notes ship with the /api/ask
    // function so they can be read at runtime. (The Notebook and configured URLs
    // need no bundling and update without a redeploy.)
    outputFileTracingIncludes: {
      '/api/ask': ['./rag/context/**/*'],
    },
  },
};

export default nextConfig;
