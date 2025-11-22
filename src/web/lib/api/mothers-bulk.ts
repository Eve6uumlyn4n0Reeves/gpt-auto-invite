import { poolAdminRequest } from '@/lib/api/admin-client'
import type { TeamFormInput } from '@/types/admin'

export async function validateMothersBulk(payload: any[]) {
  return poolAdminRequest<Array<{ index: number; valid: boolean; warnings: string[]; teams: TeamFormInput[] }>>(
    '/mothers/batch/validate',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export async function importMothersBulk(payload: any[]) {
  return poolAdminRequest<Array<{ index: number; success: boolean; error?: string }>>(
    '/mothers/batch/import',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

