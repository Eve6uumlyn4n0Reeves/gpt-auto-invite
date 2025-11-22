"use client"

import type React from "react"

import { useMemo } from "react"
import { useVirtualList } from "@/hooks/use-virtual-list"

export interface VirtualTableColumn<T> {
  key: keyof T | string
  label: React.ReactNode
  width?: number
  render?: (value: any, row: T, index: number) => React.ReactNode
}

interface VirtualTableProps<T> {
  data: T[]
  columns: VirtualTableColumn<T>[]
  height?: number
  containerHeight?: number
  itemHeight?: number
  onRowClick?: (row: T, index: number) => void
  onRowAction?: (action: string, row: T) => void
  className?: string
  loading?: boolean
  emptyMessage?: string
}

export function VirtualTable<T extends Record<string, any>>({
  data,
  columns,
  height,
  containerHeight,
  itemHeight = 50,
  onRowClick,
  onRowAction,
  className = "",
  loading = false,
  emptyMessage = "暂无数据",
}: VirtualTableProps<T>) {
  const effectiveHeight = height ?? containerHeight ?? 400
  const { totalHeight, visibleItems, handleScroll, isScrolling } = useVirtualList(data, {
    itemHeight,
    containerHeight: effectiveHeight,
    overscan: 5,
  })

  const columnWidths = useMemo(() => {
    const totalSpecifiedWidth = columns.reduce((sum, col) => sum + (col.width || 0), 0)
    const unspecifiedColumns = columns.filter((col) => !col.width).length
    const remainingWidth = Math.max(0, 100 - (totalSpecifiedWidth / window.innerWidth) * 100)
    const defaultWidth = unspecifiedColumns > 0 ? remainingWidth / unspecifiedColumns : 0

    return columns.map((col) => (col.width ? (col.width / window.innerWidth) * 100 : defaultWidth))
  }, [columns])

  if (loading) {
    return (
      <div className={`border border-border/40 rounded-lg overflow-hidden ${className}`}>
        <div className="p-4 text-sm text-muted-foreground">加载中...</div>
      </div>
    )
  }

  if (!loading && data.length === 0) {
    return (
      <div className={`border border-border/40 rounded-lg overflow-hidden ${className}`}>
        <div className="p-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className={`border border-border/40 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-muted/30 border-b border-border/40 sticky top-0 z-10">
        <div className="flex">
          {columns.map((column, index) => (
            <div
              key={String(column.key)}
              className="px-4 py-3 text-sm font-medium text-muted-foreground border-r border-border/40 last:border-r-0"
              style={{ width: `${columnWidths[index]}%` }}
            >
              {column.label}
            </div>
          ))}
        </div>
      </div>

      {/* Virtual Scrolling Container */}
      <div className="overflow-auto" style={{ height: effectiveHeight }} onScroll={handleScroll}>
        <div style={{ height: totalHeight, position: "relative" }}>
          {visibleItems.map(({ index, start }) => {
            const row = data[index]
            if (!row) return null

            const handleRowInteraction = () => {
              onRowClick?.(row, index)
              onRowAction?.("rowClick", row)
            }

            const isInteractive = Boolean(onRowClick || onRowAction)

            return (
              <div
                key={index}
                className={`absolute left-0 right-0 flex border-b border-border/40 hover:bg-muted/20 transition-colors ${
                  isInteractive ? "cursor-pointer" : ""
                } ${isScrolling ? "pointer-events-none" : ""}`}
                style={{
                  top: start,
                  height: itemHeight,
                }}
                onClick={handleRowInteraction}
              >
                {columns.map((column, colIndex) => (
                  <div
                    key={String(column.key)}
                    className="px-4 py-3 text-sm border-r border-border/40 last:border-r-0 flex items-center overflow-hidden"
                    style={{ width: `${columnWidths[colIndex]}%` }}
                  >
                    <div className="truncate">
                      {column.render ? column.render(row[column.key], row, index) : String(row[column.key] || "")}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
