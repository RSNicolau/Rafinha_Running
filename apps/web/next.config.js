/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');
const withPWA = require('@ducanh2912/next-pwa').default;
const createNextIntlPlugin = require('next-intl/plugin');

const API_URL = process.env.API_URL || 'http://localhost:3000';

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${API_URL}/api/v1/:path*`,
      },
      // Keep health check accessible without version prefix
      {
        source: '/api/health',
        destination: `${API_URL}/api/health`,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const withPWAConfig = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: '/offline',
  },
});

module.exports = withSentryConfig(withPWAConfig(withNextIntl(nextConfig)), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
