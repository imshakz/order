/** @type {import('next').NextConfig} */
const devApi = process.env.DEV_API_URL || 'http://localhost:4000';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // In Docker, nginx routes /api to the API. In local `npm run dev`, Next proxies it instead.
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [{ source: '/api/:path*', destination: `${devApi}/api/:path*` }];
  },
};

export default nextConfig;
