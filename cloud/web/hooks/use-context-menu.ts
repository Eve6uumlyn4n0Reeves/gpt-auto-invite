"use client"

import type React from "react"

import { useState, useCallback, useEffect, useRef } from "react"

interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  action: () => void
  disabled?: boolean
  separator?: boolean
  shortcut?: string
}

interface ContextMenuPosition {
  x: number
  y: number
}

export function useContextMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<ContextMenuPosition>({ x: 0, y: 0 })
  const [items, setItems] = useState<ContextMenuItem[]>([])
  const menuRef = useRef<HTMLDivElement>(null)

  const openContextMenu = useCallback((event: React.MouseEvent, menuItems: ContextMenuItem[]) => {
    event.preventDefault()
    event.stopPropagation()

    const { clientX, clientY } = event
    setPosition({ x: clientX, y: clientY })
    setItems(menuItems)
    setIsOpen(true)
  }, [])

  const closeContextMenu = useCallback(() => {
    setIsOpen(false)
    setItems([])
  }, [])

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (!item.disabled) {
        item.action()
        closeContextMenu()
      }
    },
    [closeContextMenu],
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeContextMenu()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("keydown", handleKeyDown)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
        document.removeEventListener("keydown", handleKeyDown)
      }
    }
  }, [isOpen, closeContextMenu])

  return {
    isOpen,
    position,
    items,
    menuRef,
    openContextMenu,
    closeContextMenu,
    handleItemClick,
  }
}
