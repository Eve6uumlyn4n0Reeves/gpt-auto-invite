'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'
import { createAuthActions } from '@/store/admin/actions/auth-actions'
import { createUiActions } from '@/store/admin/actions/ui-actions'
import { createStatsActions } from '@/store/admin/actions/stats-actions'
import { createMothersActions } from '@/store/admin/actions/mothers-actions'
import { createUsersActions } from '@/store/admin/actions/users-actions'
import { createCodesActions } from '@/store/admin/actions/codes-actions'
import { createAuditActions } from '@/store/admin/actions/audit-actions'
import { createBulkHistoryActions } from '@/store/admin/actions/bulk-history-actions'
import { createCodeGenerationActions } from '@/store/admin/actions/code-generation-actions'

export const createAdminActions = (dispatch: Dispatch<AdminAction>) => ({
  ...createAuthActions(dispatch),
  ...createUiActions(dispatch),
  ...createStatsActions(dispatch),
  ...createMothersActions(dispatch),
  ...createUsersActions(dispatch),
  ...createCodesActions(dispatch),
  ...createAuditActions(dispatch),
  ...createBulkHistoryActions(dispatch),
  ...createCodeGenerationActions(dispatch),
  dispatch,
})
