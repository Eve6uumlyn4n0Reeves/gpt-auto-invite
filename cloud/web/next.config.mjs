/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // Production optimizations
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  // API代理配置 - 开发环境将API请求代理到后端
  async rewrites() {
    const isDevelopment = process.env.NODE_ENV === 'development'
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'

    if (isDevelopment) {
      // 开发环境：直接代理所有API请求到后端
      // 这确保前端可以直接调用后端API
      return [
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        },
      ]
    }

    // 生产环境：不使用代理，依赖API路由文件
    return []
  },
  // Security headers
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production'

    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    ]

    // 生产环境添加HSTS
    if (isProduction) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload'
      })
    }

    // CSP策略 - 仅在生产环境使用严格策略
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval'", // 开发环境需要unsafe-eval
      "style-src 'self' 'unsafe-inline'", // 开发环境需要unsafe-inline
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]

    if (isProduction) {
      // 生产环境仍需允许内联脚本/动态编译完成 Next.js 水合，因此保留 unsafe-inline/unsafe-eval
      cspDirectives[1] = "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      cspDirectives[2] = "style-src 'self' 'unsafe-inline'"
      cspDirectives.push("upgrade-insecure-requests")
    }

    securityHeaders.push({
      key: 'Content-Security-Policy',
      value: cspDirectives.join('; ')
    })

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // API路由特殊处理
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
  // Standalone output for container deploys
  output: 'standalone',
}

export default nextConfig
