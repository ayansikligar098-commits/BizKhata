/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the whole site is plain files in `out/`, which is what
  // Cloudflare Pages serves (free hosting). No server, no paid backend.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
module.exports = nextConfig;
