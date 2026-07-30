import type { NextConfig } from 'next'
import path from 'path'

const config: NextConfig = {
  reactStrictMode: true,
  // Required for Docker deployment
  output: 'standalone',
  // Allow Turbopack to trace files outside the app directory in the monorepo
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@zenowethu/ui', '@zenowethu/shared-lib', '@zenowethu/database'],
  // Fix Prisma client resolution in monorepo Docker builds
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
}

export default config