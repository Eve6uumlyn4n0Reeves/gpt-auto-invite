import { adminRequest } from '@/lib/api/admin-client'

export interface BatchJobItem {
  id: number
  job_type: string
  status: string
  actor?: string
  total_count?: number | null
  success_count?: number | null
  failed_count?: number | null
  created_at?: string | null
  started_at?: string | null
  finished_at?: string | null
}

export interface JobsResponse {
  items?: BatchJobItem[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
    total_pages?: number
  }
}

export async function fetchJobs(params?: { status?: string; page?: number; page_size?: number }) {
  const search = new URLSearchParams()
  if (params?.status) search.set('status', params.status)
  if (params?.page) search.set('page', String(params.page))
  if (params?.page_size) search.set('page_size', String(params.page_size))
  const query = search.toString()
  const endpoint = query ? `/jobs?${query}` : '/jobs'
  return adminRequest<JobsResponse>(endpoint)
}

export async function fetchJob(jobId: number) {
  return adminRequest<{ id: number }>(`/jobs/${jobId}`)
}

