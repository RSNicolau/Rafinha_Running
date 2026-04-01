/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL || 'http://localhost:3000';

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
