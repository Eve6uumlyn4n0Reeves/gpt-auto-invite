"use client"

import { useEffect, useRef, useState } from "react"

interface UseIntersectionObserverOptions extends IntersectionObserverInit {
  freezeOnceVisible?: boolean
}

export function useIntersectionObserver(options: UseIntersectionObserverOptions = {}) {
  const { threshold = 0, root = null, rootMargin = "0%", freezeOnceVisible = false } = options

  const [entry, setEntry] = useState<IntersectionObserverEntry>()
  const [node, setNode] = useState<Element | null>(null)

  const observer = useRef<IntersectionObserver | null>(null)

  const frozen = entry?.isIntersecting && freezeOnceVisible

  useEffect(() => {
    if (!node || frozen) return

    if (observer.current) observer.current.disconnect()

    observer.current = new IntersectionObserver(([entry]) => setEntry(entry), { threshold, root, rootMargin })

    observer.current.observe(node)

    return () => {
      if (observer.current) {
        observer.current.disconnect()
      }
    }
  }, [node, threshold, root, rootMargin, frozen])

  const disconnect = () => {
    if (observer.current) {
      observer.current.disconnect()
    }
  }

  return { ref: setNode, entry, disconnect }
}

export function useLazyLoad(options?: UseIntersectionObserverOptions) {
  const { ref, entry } = useIntersectionObserver({
    threshold: 0.1,
    freezeOnceVisible: true,
    ...options,
  })

  return {
    ref,
    isVisible: !!entry?.isIntersecting,
    hasBeenVisible: !!entry?.isIntersecting,
  }
}
