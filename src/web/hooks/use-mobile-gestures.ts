"use client"

import { useState, useEffect, useCallback } from "react"

interface TouchPoint {
  x: number
  y: number
  timestamp: number
}

interface SwipeGesture {
  direction: "left" | "right" | "up" | "down"
  distance: number
  velocity: number
}

interface PinchGesture {
  scale: number
  center: { x: number; y: number }
}

export function useMobileGestures() {
  const [isTouch, setIsTouch] = useState(false)
  const [touchStart, setTouchStart] = useState<TouchPoint | null>(null)
  const [touchEnd, setTouchEnd] = useState<TouchPoint | null>(null)
  const [isPinching, setIsPinching] = useState(false)
  const [initialDistance, setInitialDistance] = useState(0)

  const swipeThreshold = 50 // minimum distance for swipe
  const velocityThreshold = 0.3 // minimum velocity for swipe

  useEffect(() => {
    setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0)
  }, [])

  const getTouchPoint = (touch: Touch): TouchPoint => ({
    x: touch.clientX,
    y: touch.clientY,
    timestamp: Date.now(),
  })

  const getDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX
    const dy = touch1.clientY - touch2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1) {
      setTouchStart(getTouchPoint(e.touches[0]))
      setTouchEnd(null)
    } else if (e.touches.length === 2) {
      setIsPinching(true)
      setInitialDistance(getDistance(e.touches[0], e.touches[1]))
    }
  }, [])

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 1 && touchStart) {
        setTouchEnd(getTouchPoint(e.touches[0]))
      }
    },
    [touchStart],
  )

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (isPinching) {
        setIsPinching(false)
        setInitialDistance(0)
        return
      }

      if (!touchStart || !touchEnd) return

      const deltaX = touchEnd.x - touchStart.x
      const deltaY = touchEnd.y - touchStart.y
      const deltaTime = touchEnd.timestamp - touchStart.timestamp
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      const velocity = distance / deltaTime

      if (distance > swipeThreshold && velocity > velocityThreshold) {
        let direction: SwipeGesture["direction"]

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          direction = deltaX > 0 ? "right" : "left"
        } else {
          direction = deltaY > 0 ? "down" : "up"
        }

        const swipeGesture: SwipeGesture = {
          direction,
          distance,
          velocity,
        }

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent("swipe", { detail: swipeGesture }))
      }

      setTouchStart(null)
      setTouchEnd(null)
    },
    [touchStart, touchEnd, isPinching],
  )

  const enableGestures = useCallback(
    (element: HTMLElement) => {
      if (!isTouch) return

      element.addEventListener("touchstart", handleTouchStart, { passive: true })
      element.addEventListener("touchmove", handleTouchMove, { passive: true })
      element.addEventListener("touchend", handleTouchEnd, { passive: true })

      return () => {
        element.removeEventListener("touchstart", handleTouchStart)
        element.removeEventListener("touchmove", handleTouchMove)
        element.removeEventListener("touchend", handleTouchEnd)
      }
    },
    [isTouch, handleTouchStart, handleTouchMove, handleTouchEnd],
  )

  return {
    isTouch,
    enableGestures,
    isPinching,
    touchStart,
    touchEnd,
  }
}
