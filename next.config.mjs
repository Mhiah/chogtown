/** @type {import('next').NextConfig} */
const nextConfig = {
  // src/instrumentation.ts runs the nightly town on hosts without Vercel Cron (e.g. Railway)
  experimental: { instrumentationHook: true },
};

export default nextConfig;
