interface PerformanceMetrics {
  requestCount: number
  totalResponseTime: number
  averageResponseTime: number
  errorCount: number
  errorRate: number
  slowRequestCount: number
  slowRequestRate: number
  lastReset: number
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    errorCount: 0,
    errorRate: 0,
    slowRequestCount: 0,
    slowRequestRate: 0,
    lastReset: Date.now(),
  }

  private slowRequestThreshold = 2000 // 2 seconds
  private resetInterval: NodeJS.Timeout

  constructor() {
    // Reset metrics every hour
    this.resetInterval = setInterval(
      () => {
        this.resetMetrics()
      },
      60 * 60 * 1000,
    )
  }

  recordRequest(responseTime: number, isError = false) {
    this.metrics.requestCount++
    this.metrics.totalResponseTime += responseTime
    this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.requestCount

    if (isError) {
      this.metrics.errorCount++
    }

    if (responseTime > this.slowRequestThreshold) {
      this.metrics.slowRequestCount++
    }

    this.metrics.errorRate = (this.metrics.errorCount / this.metrics.requestCount) * 100
    this.metrics.slowRequestRate = (this.metrics.slowRequestCount / this.metrics.requestCount) * 100
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  resetMetrics() {
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      errorCount: 0,
      errorRate: 0,
      slowRequestCount: 0,
      slowRequestRate: 0,
      lastReset: Date.now(),
    }
  }

  destroy() {
    clearInterval(this.resetInterval)
  }
}

const globalMonitor = new PerformanceMonitor()

export function withPerformanceMonitoring<T>(handler: () => Promise<T>): Promise<T> {
  const startTime = Date.now()

  return handler()
    .then((result) => {
      const responseTime = Date.now() - startTime
      globalMonitor.recordRequest(responseTime, false)
      return result
    })
    .catch((error) => {
      const responseTime = Date.now() - startTime
      globalMonitor.recordRequest(responseTime, true)
      throw error
    })
}

export function getPerformanceMetrics(): PerformanceMetrics {
  return globalMonitor.getMetrics()
}

// Request timeout utility
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 30000, // 30 seconds default
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`))
      }, timeoutMs)
    }),
  ])
}

// Retry utility with exponential backoff
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T> {
  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (attempt === maxRetries) {
        break
      }

      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

// Request deduplication utility
const pendingRequests = new Map<string, Promise<any>>()

export async function withDeduplication<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // If there's already a pending request with this key, return it
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!
  }

  // Create new request
  const promise = fn().finally(() => {
    // Clean up after completion
    pendingRequests.delete(key)
  })

  pendingRequests.set(key, promise)
  return promise
}

export { globalMonitor }
