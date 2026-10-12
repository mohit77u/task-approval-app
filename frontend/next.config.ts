import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL;

// A production build without a backend URL would silently proxy to localhost, so fail the build instead.
if (!backendUrl && process.env.NODE_ENV === 'production') {
  throw new Error('BACKEND_URL must be set for production builds');
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Tailwind v4 loader for Turbopack (create-next-app wired this into the default config).
  turbopack: { rules: { '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' } } },
  async rewrites() {
    // The browser only talks to this origin; the backend sees a server-to-server call and cookies stay first-party.
    return [{ source: '/api/:path*', destination: `${backendUrl ?? 'http://localhost:4000'}/api/:path*` }];
  },
};

export default nextConfig;
