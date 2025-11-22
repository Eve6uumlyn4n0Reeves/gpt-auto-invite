'use client'

import type { PoolState } from './types'

export const initialPoolState: PoolState = {
  mothers: [],
  mothersPage: 1,
  mothersPageSize: 20,
  mothersTotal: 0,
  mothersInitialized: false,
  mothersLoading: false,

  poolGroups: [],
  poolGroupsLoading: false,
  poolGroupsInitialized: false,
  selectedGroupId: null,
  teamTemplate: '',
  childNameTemplate: '',
  childEmailTemplate: '',
  emailDomain: '',
  namePreview: [],
  savingSettings: false,
  creatingGroup: false,
}
