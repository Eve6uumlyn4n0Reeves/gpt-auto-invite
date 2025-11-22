import withBundleAnalyser from '../../next.config.mjs'

const config = withBundleAnalyser({
  output: 'standalone',
  experimental: {},
})

export default config

