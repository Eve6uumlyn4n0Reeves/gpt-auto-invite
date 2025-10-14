import Link from 'next/link'

const navItems = [
  { href: '/admin?tab=mothers', label: '母号管理' },
  { href: '/admin?tab=codes', label: '兑换码' },
  { href: '/admin?tab=bulk-import', label: '批量导入' },
  { href: '/admin?tab=bulk-history', label: '批量历史' },
  { href: '/admin?tab=overview', label: '数据总览' },
]

export function StickyHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/admin" className="flex items-center space-x-2">
          <span className="text-lg font-semibold bg-gradient-to-r from-primary to-brand-secondary bg-clip-text text-transparent">
            GPT Team 管理平台
          </span>
        </Link>
        <nav className="flex flex-wrap gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
