interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  keyGenerator?: (request: Request) => string // Custom key generator
  skipSuccessfulRequests?: boolean // Skip counting successful requests
  skipFailedRequests?: boolean // Skip counting failed requests
}

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

class MemoryRateLimitStore {
  private store: RateLimitStore = {}
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup()
      },
      5 * 60 * 1000,
    )
  }

  private cleanup() {
    const now = Date.now()
    for (const key in this.store) {
      if (this.store[key].resetTime < now) {
        delete this.store[key]
      }
    }
  }

  get(key: string): { count: number; resetTime: number } | null {
    const entry = this.store[key]
    if (!entry || entry.resetTime < Date.now()) {
      return null
    }
    return entry
  }

  set(key: string, count: number, resetTime: number): void {
    this.store[key] = { count, resetTime }
  }

  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now()
    const resetTime = now + windowMs
    const existing = this.get(key)

    if (!existing) {
      this.set(key, 1, resetTime)
      return { count: 1, resetTime }
    }

    const newCount = existing.count + 1
    this.set(key, newCount, existing.resetTime)
    return { count: newCount, resetTime: existing.resetTime }
  }

  destroy() {
    clearInterval(this.cleanupInterval)
    this.store = {}
  }
}

const globalStore = new MemoryRateLimitStore()

export function createRateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (request: Request) => {
      // Default: use IP address from headers
      const forwarded = request.headers.get("x-forwarded-for")
      const realIp = request.headers.get("x-real-ip")
      const ip = forwarded?.split(",")[0] || realIp || "unknown"
      return ip
    },
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = config

  return {
    check: (request: Request): { allowed: boolean; limit: number; remaining: number; resetTime: number } => {
      const key = keyGenerator(request)
      const result = globalStore.increment(key, windowMs)

      const allowed = result.count <= maxRequests
      const remaining = Math.max(0, maxRequests - result.count)

      return {
        allowed,
        limit: maxRequests,
        remaining,
        resetTime: result.resetTime,
      }
    },

    middleware: async (request: Request, handler: () => Promise<Response>): Promise<Response> => {
      const rateLimitResult = globalStore.increment(keyGenerator(request), windowMs)

      if (rateLimitResult.count > maxRequests) {
        const resetTimeSeconds = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)

        return new Response(
          JSON.stringify({
            success: false,
            message: "Too many requests. Please try again later.",
            retryAfter: resetTimeSeconds,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-RateLimit-Limit": maxRequests.toString(),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": Math.ceil(rateLimitResult.resetTime / 1000).toString(),
              "Retry-After": resetTimeSeconds.toString(),
            },
          },
        )
      }

      try {
        const response = await handler()

        // Add rate limit headers to successful responses
        const newHeaders = new Headers(response.headers)
        newHeaders.set("X-RateLimit-Limit", maxRequests.toString())
        newHeaders.set("X-RateLimit-Remaining", Math.max(0, maxRequests - rateLimitResult.count).toString())
        newHeaders.set("X-RateLimit-Reset", Math.ceil(rateLimitResult.resetTime / 1000).toString())

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        })
      } catch (error) {
        // Don't count failed requests if configured
        if (skipFailedRequests) {
          // This is a simplified approach - in production you'd want more sophisticated error handling
        }
        throw error
      }
    },
  }
}

// Predefined rate limiters for different endpoints
export const redeemRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 redemption attempts per 15 minutes per IP
})

export const adminRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 admin requests per minute per IP
})

export const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 login attempts per 15 minutes per IP
})

export const exportRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10, // 10 export requests per hour per IP
})

export const batchRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 3, // 3 batch operations per 5 minutes per IP
})
