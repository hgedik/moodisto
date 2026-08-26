/**
 * The workspace packages ship CommonJS builds, so Next compiles them together with the app.
 *
 * The Content-Security-Policy is the one place that has to know the venue player embeds YouTube:
 * the player is a visible IFrame, exactly as YouTube's terms require, and nothing here tries to
 * pull an audio stream out of it.
 */
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * The development bundler ships modules as `eval`'d strings for fast refresh, so a policy without
 * `unsafe-eval` leaves every page blank while `next dev` is running. A production build compiles
 * the same code ahead of time and never evaluates a string, so the relaxation stops at the
 * development server and is not part of what gets deployed.
 */
const development = process.env.NODE_ENV !== 'production';
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  development ? " 'unsafe-eval'" : '',
  ' https://www.youtube.com https://s.ytimg.com',
].join('');

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com",
  'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
  `connect-src 'self' ${apiOrigin} ${apiOrigin.replace(/^http/, 'ws')}`,
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@moodisto/shared-types', '@moodisto/validation'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'yt3.ggpht.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
