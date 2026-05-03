/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@zenowethu/ui", "@zenowethu/shared-lib", "@zenowethu/database"],
  experimental: {
    // Enable performance optimizations
  }
};

module.exports = nextConfig;
