/** @type {import('next').NextConfig} */
const backend = `http://127.0.0.1:${process.env.API_PORT || 3001}`;
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/ws', destination: `${backend}/ws` },
      { source: '/runtime/:path*', destination: `${backend}/runtime/:path*` }
    ];
  }
};
export default nextConfig;
