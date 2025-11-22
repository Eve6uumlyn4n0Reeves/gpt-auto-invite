'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

export interface ResponsiveTableColumn<T> {
  key: keyof T | string
  label: string
  render?: (value: any, row: T) => React.ReactNode
  mobileHide?: boolean
  width?: number | string
}

export interface ResponsiveTableProps<T> {
  data: T[]
  columns: ResponsiveTableColumn<T>[]
  onRowClick?: (row: T) => void
  className?: string
  emptyMessage?: string
  loading?: boolean
}

export function ResponsiveTable<T extends { id?: number | string }>({
  data,
  columns,
  onRowClick,
  className,
  emptyMessage = '暂无数据',
  loading = false,
}: ResponsiveTableProps<T>) {
  // 桌面端表格视图
  const DesktopView = () => (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/40">
          <tr>
            {columns.map((col, index) => (
              <th
                key={String(col.key)}
                className="px-4 py-3 text-left text-sm font-medium text-muted-foreground"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                {loading ? '加载中...' : emptyMessage}
              </td>
            </tr>
          )}
          {data.map((row, rowIndex) => (
            <tr
              key={row.id || rowIndex}
              className={cn(
                'border-b border-border/40 transition-colors',
                onRowClick && 'cursor-pointer hover:bg-muted/20',
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => {
                const value = row[col.key as keyof T]
                return (
                  <td key={String(col.key)} className="px-4 py-3 text-sm">
                    {col.render ? col.render(value, row) : String(value || '-')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // 移动端卡片视图
  const MobileView = () => (
    <div className="md:hidden space-y-2">
      {data.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {loading ? '加载中...' : emptyMessage}
        </div>
      )}
      {data.map((row, rowIndex) => (
        <Card
          key={row.id || rowIndex}
          className={cn('border-border/40', onRowClick && 'cursor-pointer active:scale-[0.98]')}
          onClick={() => onRowClick?.(row)}
        >
          <CardContent className="p-4 space-y-2">
            {columns
              .filter((col) => !col.mobileHide)
              .map((col) => {
                const value = row[col.key as keyof T]
                return (
                  <div key={String(col.key)} className="flex items-start justify-between gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">{col.label}:</span>
                    <div className="text-sm text-right flex-1">
                      {col.render ? col.render(value, row) : String(value || '-')}
                    </div>
                  </div>
                )
              })}
          </CardContent>
        </Card>
      ))}
    </div>
  )

  return (
    <div className={className}>
      <DesktopView />
      <MobileView />
    </div>
  )
}

