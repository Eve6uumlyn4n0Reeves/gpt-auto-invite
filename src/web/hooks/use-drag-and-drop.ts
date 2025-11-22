"use client"

import type React from "react"

import { useState, useCallback, useRef } from "react"

interface DragState {
  isDragging: boolean
  draggedItem: any
  dragOverItem: any
  dropZone: string | null
}

export function useDragAndDrop<T>() {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedItem: null,
    dragOverItem: null,
    dropZone: null,
  })

  const dragCounter = useRef(0)

  const handleDragStart = useCallback((item: T, event: React.DragEvent) => {
    setDragState((prev) => ({
      ...prev,
      isDragging: true,
      draggedItem: item,
    }))

    // Set drag effect
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", JSON.stringify(item))

    // Add visual feedback
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "0.5"
    }
  }, [])

  const handleDragEnd = useCallback((event: React.DragEvent) => {
    setDragState({
      isDragging: false,
      draggedItem: null,
      dragOverItem: null,
      dropZone: null,
    })

    // Reset visual feedback
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "1"
    }

    dragCounter.current = 0
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const handleDragEnter = useCallback((item: T, zone: string, event: React.DragEvent) => {
    event.preventDefault()
    dragCounter.current++

    setDragState((prev) => ({
      ...prev,
      dragOverItem: item,
      dropZone: zone,
    }))
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    dragCounter.current--

    if (dragCounter.current === 0) {
      setDragState((prev) => ({
        ...prev,
        dragOverItem: null,
        dropZone: null,
      }))
    }
  }, [])

  const handleDrop = useCallback(
    (onDrop: (draggedItem: T, targetItem: T, zone: string) => void) => {
      return (event: React.DragEvent) => {
        event.preventDefault()
        dragCounter.current = 0

        if (dragState.draggedItem && dragState.dragOverItem && dragState.dropZone) {
          onDrop(dragState.draggedItem, dragState.dragOverItem, dragState.dropZone)
        }

        setDragState({
          isDragging: false,
          draggedItem: null,
          dragOverItem: null,
          dropZone: null,
        })
      }
    },
    [dragState],
  )

  return {
    dragState,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  }
}
