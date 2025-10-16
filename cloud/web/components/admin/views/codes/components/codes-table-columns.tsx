'use client'

import { Copy, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { CodeTableColumn } from '@/components/admin/sections/codes-section'
import type { CodeData } from '@/store/admin-context'

interface BuildColumnsArgs {
  allCodesSelected: boolean
  onToggleAllCodes: (next: boolean) => void
  isCodeSelected: (codeId: number) => boolean
  onToggleCode: (codeId: number, next: boolean) => void
  onCopyCode: (code: CodeData) => void
  onDisableCode: (code: CodeData) => void
}

export const buildCodesTableColumns = ({
  allCodesSelected,
  onToggleAllCodes,
  isCodeSelected,
  onToggleCode,
  onCopyCode,
  onDisableCode,
}: BuildColumnsArgs): CodeTableColumn[] => [
  {
    key: '__select',
    label: (
      <Checkbox
        checked={allCodesSelected}
        onCheckedChange={(checked) => onToggleAllCodes(checked === true)}
        aria-label="选择全部兑换码"
      />
    ),
    width: 48,
    render: (_: unknown, code: CodeData) => (
      <Checkbox
        checked={isCodeSelected(code.id)}
        onCheckedChange={(checked) => onToggleCode(code.id, checked === true)}
        aria-label={`选择兑换码 ${code.code}`}
      />
    ),
  },
  {
    key: 'code',
    label: '兑换码',
    render: (value: string) => <span className="font-mono text-sm font-medium">{value}</span>,
  },
  {
    key: 'is_used',
    label: '状态',
    render: (value: boolean) => (
      <span
        className={`rounded-full border px-2 py-1 text-xs font-medium ${
          value
            ? 'border-red-500/30 bg-red-500/20 text-red-600'
            : 'border-green-500/30 bg-green-500/20 text-green-600'
        }`}
      >
        {value ? '已使用' : '未使用'}
      </span>
    ),
  },
  {
    key: 'used_by',
    label: '邮箱',
    render: (value: string) => value || '-',
  },
  {
    key: 'mother_name',
    label: '母号',
    render: (value: string) => value || '-',
  },
  {
    key: 'team_name',
    label: '团队',
    render: (value: string, row: CodeData) => value || row.team_id || '-',
  },
  {
    key: 'batch_id',
    label: '批次',
    render: (value: string) => value || '-',
  },
  {
    key: 'created_at',
    label: '创建时间',
    render: (value: string) => (value ? new Date(value).toLocaleString() : '-'),
  },
  {
    key: 'used_at',
    label: '使用时间',
    render: (value: string) => (value ? new Date(value).toLocaleString() : '-'),
  },
  {
    key: 'actions',
    label: '操作',
    render: (_: unknown, code: CodeData) => (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            onCopyCode(code)
          }}
        >
          <Copy className="mr-1 h-4 w-4" />
          复制
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            onDisableCode(code)
          }}
          disabled={code.is_used}
        >
          <EyeOff className="mr-1 h-4 w-4" />
          禁用
        </Button>
      </div>
    ),
  },
]
