interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Clean up expired entries every 2 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup()
      },
      2 * 60 * 1000,
    )
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.cache.delete(key)
      }
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now > entry.timestamp + entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    })
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }

  destroy() {
    clearInterval(this.cleanupInterval)
    this.cache.clear()
  }
}

const globalCache = new MemoryCache()

export function createCacheKey(...parts: (string | number)[]): string {
  return parts.join(":")
}

export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 5 * 60 * 1000, // Default 5 minutes
): Promise<T> {
  // Try to get from cache first
  const cached = globalCache.get<T>(key)
  if (cached !== null) {
    return cached
  }

  // Fetch fresh data
  const data = await fetcher()

  // Store in cache
  globalCache.set(key, data, ttlMs)

  return data
}

export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    globalCache.clear()
    return
  }

  // Simple pattern matching - in production you might want more sophisticated pattern matching
  const keys = Array.from(globalCache["cache"].keys())
  for (const key of keys) {
    if (key.includes(pattern)) {
      globalCache.delete(key)
    }
  }
}

// Cache utilities for specific data types
export const CacheKeys = {
  ADMIN_STATS: "admin:stats",
  ADMIN_USERS: "admin:users",
  ADMIN_CODES: "admin:codes",
  ADMIN_MOTHERS: "admin:mothers",
  ADMIN_AUDIT_LOGS: "admin:audit-logs",
  USER_PROFILE: (userId: string) => `user:profile:${userId}`,
  TEAM_INFO: (teamId: string) => `team:info:${teamId}`,
} as const

// Cache TTL constants (in milliseconds)
export const CacheTTL = {
  SHORT: 1 * 60 * 1000, // 1 minute
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 15 * 60 * 1000, // 15 minutes
  VERY_LONG: 60 * 60 * 1000, // 1 hour
} as const

export { globalCache }
