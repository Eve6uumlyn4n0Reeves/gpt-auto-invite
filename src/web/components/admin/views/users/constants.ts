import type { InviteStatus } from '@/shared/api-types'

export const STATUS_TEXT: Record<InviteStatus, string> = {
  pending: '待处理',
  sent: '已发送',
  accepted: '已接受',
  failed: '失败',
  cancelled: '已取消',
}

export const STATUS_CLASS: Record<InviteStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  sent: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
  accepted: 'bg-green-500/20 text-green-600 border-green-500/30',
  failed: 'bg-red-500/20 text-red-600 border-red-500/30',
  cancelled: 'bg-muted/40 text-muted-foreground border-border/40',
}
