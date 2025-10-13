/**
 * 分布式限流器客户端
 * 处理来自后端Redis分布式限流器的响应和状态
 */

export interface RateLimitInfo {
  limit: number
  remaining: number
  resetTime: number
  retryAfter?: number
}

export interface RateLimitStatus {
  allowed: boolean
  info: RateLimitInfo
  usagePercentage: number
  timeToReset: string
}

export interface RateLimitStats {
  key: string
  allowed: number
  denied: number
  total: number
  successRate: number
  lastAllowed?: number
  lastDenied?: number
  remaining: number
  capacity: number
  currentUsage: number
}

export interface RateLimitConfig {
  capacity: number
  refillRate: number
  refillRatePerMinute: number
  expireSeconds: number
  name: string
  requestsPerPeriod: string
}

/**
 * 从响应头中解析限流信息
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  return {
    limit: parseInt(headers.get('X-RateLimit-Limit') || '0'),
    remaining: parseInt(headers.get('X-RateLimit-Remaining') || '0'),
    resetTime: parseInt(headers.get('X-RateLimit-Reset') || '0'),
    retryAfter: parseInt(headers.get('Retry-After') || '0') || undefined,
  }
}

/**
 * 格式化剩余时间
 */
export function formatTimeToReset(resetTime: number): string {
  const now = Math.floor(Date.now() / 1000)
  const seconds = Math.max(0, resetTime - now)

  if (seconds === 0) return '现在'
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时`
  return `${Math.floor(seconds / 86400)}天`
}

/**
 * 计算使用百分比
 */
export function calculateUsagePercentage(info: RateLimitInfo): number {
  if (info.limit === 0) return 0
  return Math.round(((info.limit - info.remaining) / info.limit) * 100)
}

/**
 * 获取限流状态
 */
export function getRateLimitStatus(headers: Headers): RateLimitStatus {
  const info = parseRateLimitHeaders(headers)
  const usagePercentage = calculateUsagePercentage(info)
  const timeToReset = formatTimeToReset(info.resetTime)

  return {
    allowed: info.remaining > 0,
    info,
    usagePercentage,
    timeToReset,
  }
}

/**
 * 检查是否被限流
 */
export function isRateLimited(response: Response): boolean {
  return response.status === 429
}

/**
 * 获取重试时间
 */
export function getRetryAfterTime(response: Response): number {
  const retryAfter = response.headers.get('Retry-After')
  if (retryAfter) {
    return parseInt(retryAfter)
  }

  // 如果没有Retry-After头，尝试从X-RateLimit-Reset计算
  const resetTime = parseInt(response.headers.get('X-RateLimit-Reset') || '0')
  const now = Math.floor(Date.now() / 1000)
  return Math.max(0, resetTime - now)
}

/**
 * 限流状态类型
 */
export type RateLimitLevel = 'low' | 'medium' | 'high' | 'critical'

/**
 * 根据使用率获取限流级别
 */
export function getRateLimitLevel(usagePercentage: number): RateLimitLevel {
  if (usagePercentage < 50) return 'low'
  if (usagePercentage < 75) return 'medium'
  if (usagePercentage < 90) return 'high'
  return 'critical'
}

/**
 * 获取限流级别的颜色
 */
export function getRateLimitColor(level: RateLimitLevel): string {
  switch (level) {
    case 'low': return 'text-green-600'
    case 'medium': return 'text-yellow-600'
    case 'high': return 'text-orange-600'
    case 'critical': return 'text-red-600'
    default: return 'text-gray-600'
  }
}

/**
 * 获取限流级别的背景色
 */
export function getRateLimitBgColor(level: RateLimitLevel): string {
  switch (level) {
    case 'low': return 'bg-green-100'
    case 'medium': return 'bg-yellow-100'
    case 'high': return 'bg-orange-100'
    case 'critical': return 'bg-red-100'
    default: return 'bg-gray-100'
  }
}

/**
 * 分布式限流器客户端类
 */
export class DistributedRateLimitClient {
  private baseUrl: string

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '') // 移除末尾斜杠
  }

  /**
   * 获取限流状态
   */
  async getStatus(key: string): Promise<RateLimitStatus | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/rate-limit/status/${key}`)
      if (!response.ok) return null

      const data = await response.json()
      return {
        allowed: data.remaining > 0,
        info: {
          limit: data.limit,
          remaining: data.remaining,
          resetTime: data.reset_at_seconds,
        },
        usagePercentage: data.usage_percentage,
        timeToReset: formatTimeToReset(data.reset_at_seconds),
      }
    } catch (error) {
      console.error('Failed to get rate limit status:', error)
      return null
    }
  }

  /**
   * 获取限流统计
   */
  async getStats(key: string): Promise<RateLimitStats | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/rate-limit/stats/${key}`)
      if (!response.ok) return null

      return await response.json()
    } catch (error) {
      console.error('Failed to get rate limit stats:', error)
      return null
    }
  }

  /**
   * 获取所有限流配置
   */
  async getConfigs(): Promise<Record<string, RateLimitConfig> | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/rate-limit/config`)
      if (!response.ok) return null

      const data = await response.json()
      return data.configs
    } catch (error) {
      console.error('Failed to get rate limit configs:', error)
      return null
    }
  }

  /**
   * 更新限流配置
   */
  async updateConfig(configId: string, config: Partial<RateLimitConfig>): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/rate-limit/config/${configId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })

      return response.ok
    } catch (error) {
      console.error('Failed to update rate limit config:', error)
      return false
    }
  }

  /**
   * 获取被拒绝最多的键
   */
  async getTopDenied(limit: number = 10): Promise<Array<{ key: string; denied_count: number }>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/rate-limit/top-denied?limit=${limit}`)
      if (!response.ok) return []

      const data = await response.json()
      return data.top_denied || []
    } catch (error) {
      console.error('Failed to get top denied keys:', error)
      return []
    }
  }

  /**
   * 获取限流器健康状态
   */
  async getHealth(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/rate-limit/health`)
      if (!response.ok) return null

      return await response.json()
    } catch (error) {
      console.error('Failed to get rate limit health:', error)
      return null
    }
  }

  /**
   * 获取限流器摘要
   */
  async getSummary(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/rate-limit/summary`)
      if (!response.ok) return null

      return await response.json()
    } catch (error) {
      console.error('Failed to get rate limit summary:', error)
      return null
    }
  }
}

// 创建默认客户端实例
export const rateLimitClient = new DistributedRateLimitClient()

/**
 * React Hook for rate limit status
 */
export function useRateLimitStatus(key: string) {
  // 这个Hook需要在React组件中使用
  // 这里只提供接口定义，实现在使用时需要结合React的useState和useEffect
  return {
    getStatus: () => rateLimitClient.getStatus(key),
    getStats: () => rateLimitClient.getStats(key),
  }
}

/**
 * 处理API请求的限流响应
 */
export async function handleRateLimitedRequest<T>(
  requestFn: () => Promise<Response>,
  onRateLimit?: (retryAfter: number) => void
): Promise<T> {
  const response = await requestFn()

  if (isRateLimited(response)) {
    const retryAfter = getRetryAfterTime(response)
    if (onRateLimit) {
      onRateLimit(retryAfter)
    }
    throw new Error(`请求过于频繁，请在 ${retryAfter} 秒后重试`)
  }

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}