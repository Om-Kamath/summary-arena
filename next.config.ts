import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['cheerio', 'rss-parser'],
}

export default nextConfig
