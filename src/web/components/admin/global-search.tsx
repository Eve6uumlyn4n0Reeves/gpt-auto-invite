'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { usersAdminRequest } from '@/lib/api/admin-client'
import { poolAdminRequest } from '@/lib/api/admin-client'

type SearchResult = {
  type: 'mother' | 'user' | 'code' | 'team'
  id: string | number
  title: string
  subtitle?: string
  url: string
}

interface GlobalSearchProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function GlobalSearch({ open: controlledOpen, onOpenChange }: GlobalSearchProps = {}) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [results, setResults] = React.useState<SearchResult[]>([])
  const router = useRouter()

  // Cmd/Ctrl + K 快捷键
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // 搜索逻辑
  const performSearch = React.useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const [mothersRes, usersRes, codesRes] = await Promise.allSettled([
        poolAdminRequest<{ items: Array<{ id: number; name: string; status: string }> }>(
          `/mothers?search=${encodeURIComponent(searchQuery)}&page_size=5`,
        ),
        usersAdminRequest<{ items: Array<{ id: number; email: string; team_name?: string }> }>(
          `/users?search=${encodeURIComponent(searchQuery)}&page_size=5`,
        ),
        usersAdminRequest<{ items: Array<{ id: number; code: string; used_by?: string }> }>(
          `/codes?search=${encodeURIComponent(searchQuery)}&page_size=5`,
        ),
      ])

      const searchResults: SearchResult[] = []

      // 处理母号结果
      if (mothersRes.status === 'fulfilled' && mothersRes.value.ok) {
        const mothers = mothersRes.value.data?.items || []
        mothers.forEach((m) => {
          searchResults.push({
            type: 'mother',
            id: m.id,
            title: m.name,
            subtitle: `状态: ${m.status}`,
            url: `/admin/mothers`,
          })
        })
      }

      // 处理用户结果
      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        const users = usersRes.value.data?.items || []
        users.forEach((u) => {
          searchResults.push({
            type: 'user',
            id: u.id,
            title: u.email,
            subtitle: u.team_name,
            url: `/admin/users`,
          })
        })
      }

      // 处理兑换码结果
      if (codesRes.status === 'fulfilled' && codesRes.value.ok) {
        const codes = codesRes.value.data?.items || []
        codes.forEach((c) => {
          searchResults.push({
            type: 'code',
            id: c.id,
            title: c.code,
            subtitle: c.used_by,
            url: `/admin/codes`,
          })
        })
      }

      setResults(searchResults)
    } catch (error) {
      console.error('Search failed:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // 防抖搜索
  React.useEffect(() => {
    const timer = setTimeout(() => {
      void performSearch(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, performSearch])

  const handleSelectResult = (result: SearchResult) => {
    router.push(result.url)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'mother':
        return '🖥️'
      case 'user':
        return '👤'
      case 'code':
        return '🎫'
      case 'team':
        return '👥'
      default:
        return '📄'
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>全局搜索</DialogTitle>
          <DialogDescription>搜索母号、用户、兑换码等内容</DialogDescription>
        </DialogHeader>

        <div className="flex items-center border-b px-4 py-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索母号、用户邮箱、兑换码... (Cmd+K)"
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
          {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin opacity-50" />}
        </div>

        {results.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto p-2">
            <div className="space-y-1">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelectResult(result)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus:bg-accent focus:text-accent-foreground focus:outline-none',
                  )}
                >
                  <span className="text-lg">{getResultIcon(result.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{result.title}</div>
                    {result.subtitle && (
                      <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{result.type}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">未找到相关结果</div>
        )}

        {query.length > 0 && query.length < 2 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            请输入至少 2 个字符以开始搜索
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { GlobalSearch }

