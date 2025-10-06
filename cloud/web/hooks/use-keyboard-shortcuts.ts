"use client"

import { useEffect, useCallback } from "react"

interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
  action: () => void
  description: string
  category?: string
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.contentEditable === "true") {
        return
      }

      const matchingShortcut = shortcuts.find((shortcut) => {
        return (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          !!event.ctrlKey === !!shortcut.ctrlKey &&
          !!event.altKey === !!shortcut.altKey &&
          !!event.shiftKey === !!shortcut.shiftKey &&
          !!event.metaKey === !!shortcut.metaKey
        )
      })

      if (matchingShortcut) {
        event.preventDefault()
        matchingShortcut.action()
      }
    },
    [shortcuts, enabled],
  )

  useEffect(() => {
    if (enabled) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown, enabled])

  return shortcuts
}

export function useGlobalShortcuts() {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: "k",
      ctrlKey: true,
      action: () => {
        // Open command palette or search
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      },
      description: "打开搜索",
      category: "导航",
    },
    {
      key: "r",
      ctrlKey: true,
      action: () => {
        // Refresh data
        const refreshButton = document.querySelector('button[aria-label*="刷新"]') as HTMLButtonElement
        if (refreshButton && !refreshButton.disabled) {
          refreshButton.click()
        }
      },
      description: "刷新数据",
      category: "操作",
    },
    {
      key: "n",
      ctrlKey: true,
      action: () => {
        // Create new item
        const createButton = document.querySelector(
          'button:contains("添加"), button:contains("生成")',
        ) as HTMLButtonElement
        if (createButton && !createButton.disabled) {
          createButton.click()
        }
      },
      description: "创建新项目",
      category: "操作",
    },
    {
      key: "Escape",
      action: () => {
        // Close modals or clear selections
        const closeButton = document.querySelector('[role="dialog"] button[aria-label*="关闭"]') as HTMLButtonElement
        if (closeButton) {
          closeButton.click()
        }
      },
      description: "关闭弹窗",
      category: "导航",
    },
  ]

  return useKeyboardShortcuts(shortcuts)
}
