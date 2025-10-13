import { setupServer } from 'msw/node'
import { rest } from 'msw'

// API 基础 URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Mock API handlers
export const handlers = [
  // 认证相关
  rest.post(`${API_BASE}/api/admin/login`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        access_token: 'mock-jwt-token',
        token_type: 'bearer',
        expires_in: 3600
      })
    )
  }),

  rest.post(`${API_BASE}/api/admin/logout`, (req, res, ctx) => {
    return res(ctx.status(200))
  }),

  // 兑换码相关
  rest.post(`${API_BASE}/api/admin/codes/generate`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        batch_id: 'batch_001',
        codes: ['CODE1', 'CODE2', 'CODE3'],
        count: 3
      })
    )
  }),

  rest.get(`${API_BASE}/api/admin/codes`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
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
    )
  }),

  // 邀请相关
  rest.post(`${API_BASE}/api/public/redeem`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        message: '兑换成功',
        invite_id: 'invite_001',
        mother_id: 'mother_001',
        team_id: 'team_001'
      })
    )
  }),

  rest.get(`${API_BASE}/api/admin/invites`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
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
    )
  }),

  // 统计相关
  rest.get(`${API_BASE}/api/admin/stats`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        total_codes: 100,
        used_codes: 50,
        pending_invites: 25,
        total_invites: 75,
        daily_stats: [
          { date: '2024-01-01', invites: 10, redemptions: 8 }
        ]
      })
    )
  }),

  // 导出相关
  rest.get(`${API_BASE}/api/admin/export/users`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.body('CSV,data,here\nuser1@example.com,2024-01-01')
    )
  }),

  // 健康检查
  rest.get(`${API_BASE}/health`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ ok: true })
    )
  }),

  // 错误处理
  rest.post(`${API_BASE}/api/public/redeem`, (req, res, ctx) => {
    const { code } = req.body as any

    if (code === 'invalid-code') {
      return res(
        ctx.status(400),
        ctx.json({
          success: false,
          message: '兑换码无效'
        })
      )
    }

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        message: '兑换成功'
      })
    )
  }),
]

// 创建 Mock 服务器
export const server = setupServer(...handlers)