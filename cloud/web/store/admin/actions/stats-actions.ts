'use client'

import type { Dispatch } from 'react'
import type { AdminAction } from '@/store/admin/reducer'
import type { StatsData } from '@/store/admin/types'

export const createStatsActions = (dispatch: Dispatch<AdminAction>) => ({
  setStats(stats: StatsData | null) {
    dispatch({ type: 'SET_STATS', payload: stats })
  },
  setStatsLoading(value: boolean) {
    dispatch({ type: 'SET_STATS_LOADING', payload: value })
  },
})
