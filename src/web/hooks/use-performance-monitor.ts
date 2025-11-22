"use client"

import { useEffect, useRef, useState, useCallback } from "react"

interface PerformanceMetrics {
  renderTime: number
  memoryUsage?: number
  componentCount: number
  reRenderCount: number
  lastRenderTimestamp: number
}

interface PerformanceOptions {
  trackMemory?: boolean
  sampleRate?: number // 0-1, percentage of renders to track
  onMetricsUpdate?: (metrics: PerformanceMetrics) => void
}

export function usePerformanceMonitor(componentName: string, options: PerformanceOptions = {}) {
  const { trackMemory = false, sampleRate = 0.1, onMetricsUpdate } = options

  const renderStartTime = useRef<number>(0)
  const renderCount = useRef<number>(0)
  const componentCount = useRef<number>(0)
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    componentCount: 0,
    reRenderCount: 0,
    lastRenderTimestamp: 0,
  })

  const startRender = useCallback(() => {
    if (Math.random() > sampleRate) return
    renderStartTime.current = performance.now()
  }, [sampleRate])

  const endRender = useCallback(() => {
    if (renderStartTime.current === 0) return

    const renderTime = performance.now() - renderStartTime.current
    renderCount.current += 1

    const newMetrics: PerformanceMetrics = {
      renderTime,
      componentCount: componentCount.current,
      reRenderCount: renderCount.current,
      lastRenderTimestamp: Date.now(),
      ...(trackMemory &&
        (performance as any).memory && {
          memoryUsage: (performance as any).memory.usedJSHeapSize,
        }),
    }

    setMetrics(newMetrics)
    onMetricsUpdate?.(newMetrics)

    renderStartTime.current = 0
  }, [trackMemory, onMetricsUpdate])

  useEffect(() => {
    startRender()
    return () => {
      endRender()
    }
  })

  const incrementComponentCount = useCallback(() => {
    componentCount.current += 1
  }, [])

  const decrementComponentCount = useCallback(() => {
    componentCount.current = Math.max(0, componentCount.current - 1)
  }, [])

  return {
    metrics,
    incrementComponentCount,
    decrementComponentCount,
    startRender,
    endRender,
  }
}

export function useRenderTracker(componentName: string) {
  const renderCount = useRef(0)
  const lastRenderTime = useRef(Date.now())

  useEffect(() => {
    renderCount.current += 1
    const now = Date.now()
    const timeSinceLastRender = now - lastRenderTime.current
    lastRenderTime.current = now

    if (process.env.NODE_ENV === "development") {
      console.log(`[${componentName}] Render #${renderCount.current}, Time since last: ${timeSinceLastRender}ms`)
    }
  })

  return {
    renderCount: renderCount.current,
    lastRenderTime: lastRenderTime.current,
  }
}
