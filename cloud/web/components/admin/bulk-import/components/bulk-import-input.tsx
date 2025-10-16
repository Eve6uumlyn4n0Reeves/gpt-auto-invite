'use client'

import { Upload } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface BulkImportInputProps {
  textInput: string
  delimiter: string
  loading: boolean
  lastUploadedFile: string | null
  onTextChange: (value: string) => void
  onDelimiterChange: (value: string) => void
  onParseText: () => void
  onClearText: () => void
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>
}

export function BulkImportInput({
  textInput,
  delimiter,
  loading,
  lastUploadedFile,
  onTextChange,
  onDelimiterChange,
  onParseText,
  onClearText,
  onFileUpload,
}: BulkImportInputProps) {
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bulk-text">粘贴母号列表</Label>
          <Textarea
            id="bulk-text"
            value={textInput}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={`示例：\nuser1@example.com---token1\nuser2@example.com---token2---备注信息`}
            className="min-h-[160px] bg-background/60 font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Label htmlFor="bulk-delimiter" className="text-xs">
                分隔符
              </Label>
              <Input
                id="bulk-delimiter"
                value={delimiter}
                onChange={(event) => onDelimiterChange(event.target.value)}
                className="h-8 w-24 bg-background/60"
              />
            </div>
            <span>默认使用 "---" 拆分邮箱与 access token，支持追加备注。</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onParseText} disabled={loading}>
              解析文本
            </Button>
            <Button variant="ghost" size="sm" onClick={onClearText}>
              清空
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>上传 JSON / JSONL</Label>
          <div className="rounded-lg border border-dashed border-border/50 bg-background/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">支持 JSON 数组或 JSON Lines</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {lastUploadedFile ? `已上传：${lastUploadedFile}` : '字段需包含 name、access_token、teams 等信息'}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-background/80">
                <Upload className="h-4 w-4" />
                选择文件
                <input
                  type="file"
                  accept=".json,.jsonl,.ndjson,.txt"
                  className="hidden"
                  onChange={onFileUpload}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
