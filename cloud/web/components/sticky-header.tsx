'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_TAB_ROUTES } from '@/lib/admin-navigation'

const navItems = [
  { href: ADMIN_TAB_ROUTES.mothers, label: '母号管理' },
  { href: ADMIN_TAB_ROUTES.users, label: '用户管理' },
  { href: ADMIN_TAB_ROUTES.codes, label: '兑换码' },
  { href: ADMIN_TAB_ROUTES['bulk-import'], label: '批量导入' },
  { href: ADMIN_TAB_ROUTES['bulk-history'], label: '批量历史' },
  { href: ADMIN_TAB_ROUTES.overview, label: '数据总览' },
]

export function StickyHeader() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href={ADMIN_TAB_ROUTES.mothers} className="flex items-center space-x-2">
          <span className="text-lg font-semibold bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent">
            GPT Team 管理平台
          </span>
        </Link>
        <nav className="flex flex-wrap gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium px-3 py-2 rounded-md transition-colors ${
                pathname === item.href
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
