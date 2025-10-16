'use client'

import { Send, Ban, UserX } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import type { UserTableColumn } from '@/components/admin/sections/users-section'
import type { UserData } from '@/store/admin-context'
import { STATUS_CLASS, STATUS_TEXT } from '../constants'

type UserAction = 'resend' | 'cancel' | 'remove'

interface BuildUserColumnsArgs {
  allUsersSelected: boolean
  onToggleAll: (next: boolean) => void
  isUserSelected: (userId: number) => boolean
  onToggleUser: (userId: number, next: boolean) => void
  onUserAction: (user: UserData, action: UserAction) => void
  userActionLoading: number | null
}

export const buildUserTableColumns = ({
  allUsersSelected,
  onToggleAll,
  isUserSelected,
  onToggleUser,
  onUserAction,
  userActionLoading,
}: BuildUserColumnsArgs): UserTableColumn[] => [
  {
    key: '__select',
    label: (
      <Checkbox
        checked={allUsersSelected}
        onCheckedChange={(checked) => onToggleAll(checked === true)}
        aria-label="选择全部用户"
      />
    ),
    width: 48,
    render: (_: unknown, user: UserData) => (
      <Checkbox
        checked={isUserSelected(user.id)}
        onCheckedChange={(checked) => onToggleUser(user.id, checked === true)}
        aria-label={`选择 ${user.email}`}
      />
    ),
  },
  {
    key: 'email',
    label: '邮箱',
    mobile: { priority: 'high' as const },
    render: (value: string) => <span className="font-medium text-foreground">{value}</span>,
  },
  {
    key: 'status',
    label: '状态',
    mobile: { priority: 'medium' as const, label: '状态' },
    render: (value: string) => (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium border ${
          STATUS_CLASS[value] ?? 'border-border/40'
        }`}
      >
        {STATUS_TEXT[value] ?? value}
      </span>
    ),
  },
  {
    key: 'team_name',
    label: '团队',
    mobile: { priority: 'medium' as const, label: '团队' },
    render: (value: string) => value || '未分配',
  },
  {
    key: 'code_used',
    label: '兑换码',
    mobile: { priority: 'low' as const },
    render: (value: string) => value || '无',
  },
  {
    key: 'invited_at',
    label: '邀请时间',
    mobile: { priority: 'low' as const },
    render: (value: string) => (value ? new Date(value).toLocaleString() : '-'),
  },
  {
    key: 'actions',
    label: '操作',
    mobile: { priority: 'low' as const, label: '操作' },
    render: (_: unknown, user: UserData) => (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            onUserAction(user, 'resend')
          }}
          disabled={userActionLoading === user.id || user.status === 'sent'}
        >
          <Send className={`mr-1 h-4 w-4 ${userActionLoading === user.id ? 'animate-spin' : ''}`} />
          <span className="hidden xl:inline">重发</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            onUserAction(user, 'cancel')
          }}
          disabled={userActionLoading === user.id}
        >
          <Ban className="mr-1 h-4 w-4" />
          <span className="hidden xl:inline">取消</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            onUserAction(user, 'remove')
          }}
          disabled={userActionLoading === user.id}
        >
          <UserX className="mr-1 h-4 w-4" />
          <span className="hidden xl:inline">移除</span>
        </Button>
      </div>
    ),
  },
]
