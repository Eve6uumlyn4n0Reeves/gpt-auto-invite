'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'

const pathNameMap: Record<string, string> = {
  admin: '管理后台',
  overview: '数据总览',
  mothers: '母号管理',
  users: '用户管理',
  codes: '兑换码',
  'codes-status': '码状态',
  'bulk-import': '批量导入',
  'bulk-history': '批量历史',
  jobs: '任务队列',
  'auto-ingest': '自动录入',
  audit: '审计日志',
  settings: '系统设置',
  'pool-groups': '号池组',
  'switch-queue': '切换队列',
}

export function NavigationBreadcrumb() {
  const pathname = usePathname()

  // 解析路径生成面包屑
  const pathSegments = pathname.split('/').filter(Boolean)
  
  // 移除可能的 (protected) 等括号路径
  const cleanSegments = pathSegments.filter(seg => !seg.startsWith('('))

  if (cleanSegments.length <= 1) {
    return null // 首页不显示面包屑
  }

  const breadcrumbs = cleanSegments.map((segment, index) => {
    const path = '/' + cleanSegments.slice(0, index + 1).join('/')
    const name = pathNameMap[segment] || segment
    const isLast = index === cleanSegments.length - 1

    return {
      name,
      path,
      isLast,
    }
  })

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/admin/overview">
              <Home className="h-3.5 w-3.5" />
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {crumb.isLast ? (
                <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={crumb.path}>{crumb.name}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

