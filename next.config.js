
/** @type {import('next').NextConfig} */
const path = require('path');

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "img-src 'self' blob: data: https://placehold.co https://storage.googleapis.com https://picsum.photos",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' blob: data: https://nominatim.openstreetmap.org",
  "media-src 'self' blob: data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://uatcheckout.yagoutpay.com",
].join('; ');

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  {
    key: 'Content-Security-Policy',
    value: csp.replace(/\s{2,}/g, ' ').trim(),
  },
];

const nextConfig = {
  output: "standalone",           // ✅ standalone build
  reactStrictMode: true,          // recommended
  experimental: {
    serverActions: {
       bodySizeLimit: '10mb',
    },            // ✅ must be an object, not boolean
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  poweredByHeader: false,
};

module.exports = nextConfig;
