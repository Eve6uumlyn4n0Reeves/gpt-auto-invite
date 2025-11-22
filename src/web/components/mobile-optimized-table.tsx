"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronRight, MoreVertical } from "lucide-react"
import { useMobileGestures } from "@/hooks/use-mobile-gestures"

export interface MobileTableColumn<T = Record<string, unknown>> {
  key: keyof T | string
  label: React.ReactNode
  render?: (value: any, row: T) => React.ReactNode
  mobile?: {
    priority: "high" | "medium" | "low"
    label?: string
  }
}

interface MobileOptimizedTableProps<T = Record<string, unknown>> {
  data: T[]
  columns: MobileTableColumn<T>[]
  onRowAction?: (action: string, row: T) => void
  loading?: boolean
  emptyMessage?: string
}

export function MobileOptimizedTable<T = Record<string, unknown>>({
  data,
  columns,
  onRowAction,
  loading = false,
  emptyMessage = "暂无数据",
}: MobileOptimizedTableProps<T>) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const { isTouch } = useMobileGestures()

  const toggleRowExpansion = (index: number) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedRows(newExpanded)
  }

  const getPriorityColumns = (priority: "high" | "medium" | "low") =>
    columns.filter((col) => col.mobile?.priority === priority)

  const getCellValue = (row: T, columnKey: keyof T | string) => {
    if (typeof columnKey === "string") {
      return (row as Record<string, unknown>)[columnKey]
    }
    return row[columnKey]
  }

  const highPriorityColumns = getPriorityColumns("high")
  const mediumPriorityColumns = getPriorityColumns("medium")
  const lowPriorityColumns = getPriorityColumns("low")

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {data.map((row, index) => {
        const isExpanded = expandedRows.has(index)

        return (
          <Card key={index} className="overflow-hidden transition-all duration-200 hover:shadow-md">
            <CardContent className="p-0">
              {/* Main Row - Always Visible */}
              <div className="p-4 cursor-pointer" onClick={() => toggleRowExpansion(index)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    {/* High Priority Fields */}
                    <div className="space-y-1">
                      {highPriorityColumns.map((column) => {
                        const rawValue = getCellValue(row, column.key)
                        const displayValue = column.render
                          ? column.render(rawValue, row)
                          : (rawValue as React.ReactNode)

                        return (
                          <div key={String(column.key)} className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground truncate">{displayValue}</span>
                          </div>
                        )
                      })}

                      {/* Medium Priority Fields - Condensed */}
                      {mediumPriorityColumns.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {mediumPriorityColumns.map((column) => {
                            const rawValue = getCellValue(row, column.key)
                            const displayValue = column.render
                              ? column.render(rawValue, row)
                              : (rawValue as React.ReactNode)
                            const labelNode = column.mobile?.label ?? column.label
                            const labelText = typeof labelNode === "string" ? labelNode : ""

                            return (
                              <Badge key={String(column.key)} variant="secondary" className="text-xs">
                                {labelText && <span>{labelText}: </span>}
                                {displayValue}
                              </Badge>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {onRowAction && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRowAction("menu", row)
                        }}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    )}

                    {lowPriorityColumns.length > 0 && (
                      <Button variant="ghost" size="sm" className="p-1">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && lowPriorityColumns.length > 0 && (
                <div className="px-4 pb-4 border-t border-border/40 bg-muted/20">
                  <div className="pt-3 space-y-2">
                    {lowPriorityColumns.map((column) => {
                      const rawValue = getCellValue(row, column.key)
                      const displayValue = column.render
                        ? column.render(rawValue, row)
                        : (rawValue as React.ReactNode)
                      const labelNode = column.mobile?.label ?? column.label
                      const labelText = typeof labelNode === "string" ? labelNode : ""

                      return (
                        <div key={String(column.key)} className="flex justify-between items-start">
                          <span className="text-sm text-muted-foreground font-medium">
                            {labelText}
                            {labelText ? ":" : ""}
                          </span>
                          <span className="text-sm text-foreground text-right ml-2">{displayValue}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
