"use client"

import { useState, useEffect, useMemo, useCallback } from "react"

interface VirtualListOptions {
  itemHeight: number
  containerHeight: number
  overscan?: number
  scrollingDelay?: number
}

interface VirtualListItem {
  index: number
  start: number
  end: number
}

export function useVirtualList<T>(items: T[], options: VirtualListOptions) {
  const { itemHeight, containerHeight, overscan = 5, scrollingDelay = 150 } = options

  const [scrollTop, setScrollTop] = useState(0)
  const [isScrolling, setIsScrolling] = useState(false)
  const [scrollingTimeoutId, setScrollingTimeoutId] = useState<NodeJS.Timeout | null>(null)

  const totalHeight = items.length * itemHeight
  const visibleCount = Math.ceil(containerHeight / itemHeight)

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(items.length - 1, startIndex + visibleCount + overscan * 2)

  const visibleItems = useMemo(() => {
    const result: VirtualListItem[] = []
    for (let i = startIndex; i <= endIndex; i++) {
      result.push({
        index: i,
        start: i * itemHeight,
        end: (i + 1) * itemHeight,
      })
    }
    return result
  }, [startIndex, endIndex, itemHeight])

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const scrollTop = event.currentTarget.scrollTop
      setScrollTop(scrollTop)
      setIsScrolling(true)

      if (scrollingTimeoutId) {
        clearTimeout(scrollingTimeoutId)
      }

      const timeoutId = setTimeout(() => {
        setIsScrolling(false)
      }, scrollingDelay)

      setScrollingTimeoutId(timeoutId)
    },
    [scrollingDelay, scrollingTimeoutId],
  )

  useEffect(() => {
    return () => {
      if (scrollingTimeoutId) {
        clearTimeout(scrollingTimeoutId)
      }
    }
  }, [scrollingTimeoutId])

  return {
    totalHeight,
    visibleItems,
    startIndex,
    endIndex,
    isScrolling,
    handleScroll,
    scrollTop,
  }
}