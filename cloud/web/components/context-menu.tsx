"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  action?: () => void
  disabled?: boolean
  separator?: boolean
  shortcut?: string
}

interface ContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  items: ContextMenuItem[]
  onItemClick: (item: ContextMenuItem) => void
  menuRef: React.RefObject<HTMLDivElement>
}

export function ContextMenu({ isOpen, position, items, onItemClick, menuRef }: ContextMenuProps) {
  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-48 bg-popover border border-border rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(0, 0)",
      }}
    >
      <div className="p-1">
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            {item.separator ? (
              <div className="h-px bg-border my-1" />
            ) : (
              <button
                onClick={() => item.action && onItemClick(item)}
                disabled={item.disabled}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus:bg-accent focus:text-accent-foreground focus:outline-none",
                  item.disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                <div className="flex items-center space-x-2">
                  {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                  <span>{item.label}</span>
                </div>
                {item.shortcut && <span className="text-xs text-muted-foreground font-mono">{item.shortcut}</span>}
              </button>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
