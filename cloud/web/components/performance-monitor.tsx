"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { usePerformanceMonitor } from "@/hooks/use-performance-monitor"

interface PerformanceMonitorProps {
  enabled?: boolean
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right"
}

export function PerformanceMonitor({
  enabled = process.env.NODE_ENV === "development",
  position = "bottom-right",
}: PerformanceMonitorProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [performanceData, setPerformanceData] = useState<any[]>([])

  const { metrics } = usePerformanceMonitor("PerformanceMonitor", {
    trackMemory: true,
    sampleRate: 1,
    onMetricsUpdate: (newMetrics) => {
      setPerformanceData((prev) => [...prev.slice(-19), newMetrics])
    },
  })

  useEffect(() => {
    if (!enabled) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        setIsVisible((prev) => !prev)
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [enabled])

  if (!enabled || !isVisible) {
    return enabled ? (
      <div className={`fixed ${getPositionClasses(position)} z-50`}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsVisible(true)}
          className="bg-background/80 backdrop-blur-sm"
        >
          📊
        </Button>
      </div>
    ) : null
  }

  const avgRenderTime =
    performanceData.length > 0
      ? performanceData.reduce((sum, data) => sum + data.renderTime, 0) / performanceData.length
      : 0

  const memoryUsage = metrics.memoryUsage ? `${(metrics.memoryUsage / 1024 / 1024).toFixed(1)} MB` : "N/A"

  return (
    <div className={`fixed ${getPositionClasses(position)} z-50 w-80`}>
      <Card className="bg-background/95 backdrop-blur-sm border-border/40 shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Performance Monitor</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)} className="h-6 w-6 p-0">
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-muted-foreground">Render Time</div>
              <Badge variant={avgRenderTime > 16 ? "destructive" : "secondary"}>{avgRenderTime.toFixed(1)}ms</Badge>
            </div>
            <div>
              <div className="text-muted-foreground">Memory</div>
              <Badge variant="outline">{memoryUsage}</Badge>
            </div>
            <div>
              <div className="text-muted-foreground">Re-renders</div>
              <Badge variant="outline">{metrics.reRenderCount}</Badge>
            </div>
            <div>
              <div className="text-muted-foreground">Components</div>
              <Badge variant="outline">{metrics.componentCount}</Badge>
            </div>
          </div>

          {performanceData.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">Render History</div>
              <div className="flex items-end space-x-1 h-8">
                {performanceData.slice(-20).map((data, index) => (
                  <div
                    key={index}
                    className={`w-1 ${
                      data.renderTime > 16 ? "bg-red-500" : data.renderTime > 8 ? "bg-yellow-500" : "bg-green-500"
                    }`}
                    style={{
                      height: `${Math.min(100, (data.renderTime / 50) * 100)}%`,
                    }}
                    title={`${data.renderTime.toFixed(1)}ms`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">Press Ctrl+Shift+P to toggle</div>
        </CardContent>
      </Card>
    </div>
  )
}

function getPositionClasses(position: string): string {
  switch (position) {
    case "top-left":
      return "top-4 left-4"
    case "top-right":
      return "top-4 right-4"
    case "bottom-left":
      return "bottom-4 left-4"
    case "bottom-right":
    default:
      return "bottom-4 right-4"
  }
}
