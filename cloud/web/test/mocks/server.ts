import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// API 基础 URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Mock API handlers
export const handlers = [
  // 认证相关
  http.post(`${API_BASE}/api/admin/login`, () => {
    return HttpResponse.json({
      access_token: 'mock-jwt-token',
      token_type: 'bearer',
      expires_in: 3600
    })
  }),

  http.post(`${API_BASE}/api/admin/logout`, () => {
    return HttpResponse.json({}, { status: 200 })
  }),

  // 兑换码相关
  http.post(`${API_BASE}/api/admin/codes/generate`, () => {
    return HttpResponse.json({
      batch_id: 'batch_001',
      codes: ['CODE1', 'CODE2', 'CODE3'],
      count: 3
    })
  }),

  http.get(`${API_BASE}/api/admin/codes`, () => {
    return HttpResponse.json({
      codes: [
        {
          id: 1,
          batch_id: 'batch_001',
          code_hash: 'hash_1',
          status: 'unused',
          created_at: '2024-01-01T00:00:00Z'
        }
      ],
      total: 1,
      page: 1,
      size: 10
    })
  }),

  // 邀请相关
  http.post(`${API_BASE}/api/public/redeem`, async ({ request }) => {
    const body = await request.json().catch(() => ({}))
    if ((body as any).code === 'invalid-code') {
      return HttpResponse.json(
        {
          success: false,
          message: '兑换码无效'
        },
        { status: 400 }
      )
    }

    return HttpResponse.json({
      success: true,
      message: '兑换成功',
      invite_id: 'invite_001',
      mother_id: 'mother_001',
      team_id: 'team_001'
    })
  }),

  http.get(`${API_BASE}/api/admin/invites`, () => {
    return HttpResponse.json({
      invites: [
        {
          id: 1,
          email: 'user@example.com',
          status: 'pending',
          created_at: '2024-01-01T00:00:00Z'
        }
      ],
      total: 1,
      page: 1,
      size: 10
    })
  }),

  // 统计相关
  http.get(`${API_BASE}/api/admin/stats`, () => {
    return HttpResponse.json({
      total_codes: 100,
      used_codes: 50,
      pending_invites: 25,
      total_invites: 75,
      daily_stats: [
        { date: '2024-01-01', invites: 10, redemptions: 8 }
      ]
    })
  }),

  // 导出相关
  http.get(`${API_BASE}/api/admin/export/users`, () => {
    return new HttpResponse('CSV,data,here\nuser1@example.com,2024-01-01', {
      status: 200,
      headers: { 'Content-Type': 'text/csv' }
    })
  }),

  // 健康检查
  http.get(`${API_BASE}/health`, () => {
    return HttpResponse.json({ ok: true })
  }),
]

// 创建 Mock 服务器
export const server = setupServer(...handlers)
