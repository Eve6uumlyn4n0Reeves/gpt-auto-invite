"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { useLazyLoad } from "@/hooks/use-intersection-observer"

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  placeholder?: string
  fallback?: string
  onLoad?: () => void
  onError?: () => void
  threshold?: number
}

export function LazyImage({
  src,
  alt,
  placeholder = "/loading-screen-animation.png",
  fallback = "/system-error-screen.png",
  onLoad,
  onError,
  threshold = 0.1,
  className = "",
  ...props
}: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string>(placeholder)
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading")
  const imageRef = useRef<HTMLImageElement>(null)

  const { ref: intersectionRef, isVisible } = useLazyLoad({
    threshold,
    freezeOnceVisible: true,
  })

  useEffect(() => {
    if (!isVisible) return

    const img = new Image()

    img.onload = () => {
      setImageSrc(src)
      setImageStatus("loaded")
      onLoad?.()
    }

    img.onerror = () => {
      setImageSrc(fallback)
      setImageStatus("error")
      onError?.()
    }

    img.src = src
  }, [isVisible, src, fallback, onLoad, onError])

  const setRefs = (element: HTMLImageElement | null) => {
    imageRef.current = element
    intersectionRef(element)
  }

  return (
    <img
      ref={setRefs}
      src={imageSrc || "/placeholder.svg"}
      alt={alt}
      className={`transition-opacity duration-300 ${
        imageStatus === "loading" ? "opacity-50" : "opacity-100"
      } ${className}`}
      {...props}
    />
  )
}
