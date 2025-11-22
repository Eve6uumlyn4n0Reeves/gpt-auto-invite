'use client'

import { Copy, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CodesGeneratedPanelProps {
  codes: string[]
  onCopyAll: () => void
  onDownload: () => void
}

export function CodesGeneratedPanel({ codes, onCopyAll, onDownload }: CodesGeneratedPanelProps) {
  if (codes.length === 0) return null

  return (
    <div className="space-y-4 rounded-lg border border-border/40 bg-card/50 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">已生成兑换码</h3>
          <p className="text-sm text-muted-foreground">共 {codes.length} 个，可复制或下载</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCopyAll}>
            <Copy className="h-4 w-4" />
            复制全部
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDownload}>
            <Download className="h-4 w-4" />
            下载 TXT
          </Button>
        </div>
      </div>
      <pre className="max-h-64 overflow-auto rounded-md border border-border/30 bg-background/40 p-3 text-xs leading-6">
        {codes.join('\n')}
      </pre>
    </div>
  )
}
