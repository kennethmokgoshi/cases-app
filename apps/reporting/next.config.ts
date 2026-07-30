import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Required for Docker deployment
  output: 'standalone',
  // Fix Prisma client resolution in monorepo Docker builds
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
}

export default config