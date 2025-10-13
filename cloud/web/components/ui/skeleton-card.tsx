'use client'

import React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export const SkeletonCard: React.FC = () => (
  <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded w-20 animate-pulse"></div>
          <div className="h-3 bg-muted rounded w-32 animate-pulse"></div>
        </div>
        <div className="w-8 h-8 bg-muted rounded-lg animate-pulse"></div>
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        <div className="h-8 bg-muted rounded w-16 animate-pulse"></div>
        <div className="h-2 bg-muted rounded w-full animate-pulse"></div>
      </div>
    </CardContent>
  </Card>
)

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center space-x-4 p-3 border border-border/40 rounded-lg">
        <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-1/3 animate-pulse"></div>
          <div className="h-3 bg-muted rounded w-1/2 animate-pulse"></div>
        </div>
        <div className="w-16 h-6 bg-muted rounded animate-pulse"></div>
      </div>
    ))}
  </div>
)