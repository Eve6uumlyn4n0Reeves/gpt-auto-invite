"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Hash, Users, Key, Settings, Activity, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Command {
  id: string
  title: string
  description?: string
  icon?: React.ReactNode
  category: string
  action: () => void
  keywords?: string[]
  shortcut?: string
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  commands: Command[]
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [search, setSearch] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filteredCommands = useMemo(() => {
    if (!search) return commands

    const searchLower = search.toLowerCase()
    return commands.filter((command) => {
      const titleMatch = command.title.toLowerCase().includes(searchLower)
      const descriptionMatch = command.description?.toLowerCase().includes(searchLower)
      const keywordMatch = command.keywords?.some((keyword) => keyword.toLowerCase().includes(searchLower))
      const categoryMatch = command.category.toLowerCase().includes(searchLower)

      return titleMatch || descriptionMatch || keywordMatch || categoryMatch
    })
  }, [commands, search])

  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {}
    filteredCommands.forEach((command) => {
      if (!groups[command.category]) {
        groups[command.category] = []
      }
      groups[command.category].push(command)
    })
    return groups
  }, [filteredCommands])

  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  useEffect(() => {
    if (!isOpen) {
      setSearch("")
      setSelectedIndex(0)
    }
  }, [isOpen])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1))
        break
      case "ArrowUp":
        event.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        break
      case "Enter":
        event.preventDefault()
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action()
          onClose()
        }
        break
      case "Escape":
        onClose()
        break
    }
  }

  const handleCommandClick = (command: Command) => {
    command.action()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="flex items-center border-b border-border px-4 py-3">
          <Search className="w-4 h-4 text-muted-foreground mr-3" />
          <Input
            placeholder="搜索命令..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
        </div>

        <div className="max-h-96 overflow-y-auto">
          {Object.keys(groupedCommands).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>未找到匹配的命令</p>
            </div>
          ) : (
            <div className="p-2">
              {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                <div key={category} className="mb-4 last:mb-0">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {category}
                  </div>
                  <div className="space-y-1">
                    {categoryCommands.map((command, index) => {
                      const globalIndex = filteredCommands.indexOf(command)
                      return (
                        <button
                          key={command.id}
                          onClick={() => handleCommandClick(command)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 text-left rounded-lg transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            globalIndex === selectedIndex && "bg-accent text-accent-foreground",
                          )}
                        >
                          <div className="flex items-center space-x-3">
                            {command.icon && <div className="w-4 h-4 text-muted-foreground">{command.icon}</div>}
                            <div>
                              <div className="font-medium">{command.title}</div>
                              {command.description && (
                                <div className="text-sm text-muted-foreground">{command.description}</div>
                              )}
                            </div>
                          </div>
                          {command.shortcut && (
                            <Badge variant="outline" className="text-xs font-mono">
                              {command.shortcut}
                            </Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          使用 ↑↓ 导航，Enter 执行，Esc 关闭
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  const commands: Command[] = [
    {
      id: "search",
      title: "搜索",
      description: "搜索用户、兑换码或其他内容",
      icon: <Search className="w-4 h-4" />,
      category: "导航",
      action: () => {
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      },
      keywords: ["search", "find", "查找"],
      shortcut: "Ctrl+K",
    },
    {
      id: "overview",
      title: "概览",
      description: "查看系统概览和统计信息",
      icon: <BarChart3 className="w-4 h-4" />,
      category: "导航",
      action: () => {
        const overviewTab = document.querySelector('[value="overview"]') as HTMLElement
        overviewTab?.click()
      },
      keywords: ["dashboard", "stats", "统计", "概览"],
    },
    {
      id: "users",
      title: "用户管理",
      description: "管理用户和邀请状态",
      icon: <Users className="w-4 h-4" />,
      category: "导航",
      action: () => {
        const usersTab = document.querySelector('[value="users"]') as HTMLElement
        usersTab?.click()
      },
      keywords: ["users", "invites", "用户", "邀请"],
    },
    {
      id: "codes",
      title: "兑换码管理",
      description: "生成和管理兑换码",
      icon: <Key className="w-4 h-4" />,
      category: "导航",
      action: () => {
        const codesTab = document.querySelector('[value="codes"]') as HTMLElement
        codesTab?.click()
      },
      keywords: ["codes", "generate", "兑换码", "生成"],
    },
    {
      id: "audit",
      title: "审计日志",
      description: "查看系统操作日志",
      icon: <Activity className="w-4 h-4" />,
      category: "导航",
      action: () => {
        const auditTab = document.querySelector('[value="audit"]') as HTMLElement
        auditTab?.click()
      },
      keywords: ["audit", "logs", "审计", "日志"],
    },
    {
      id: "settings",
      title: "系统设置",
      description: "配置系统参数",
      icon: <Settings className="w-4 h-4" />,
      category: "导航",
      action: () => {
        const settingsTab = document.querySelector('[value="settings"]') as HTMLElement
        settingsTab?.click()
      },
      keywords: ["settings", "config", "设置", "配置"],
    },
    {
      id: "refresh",
      title: "刷新数据",
      description: "重新加载最新数据",
      icon: <Hash className="w-4 h-4" />,
      category: "操作",
      action: () => {
        const refreshButton = document.querySelector('button:contains("刷新")') as HTMLButtonElement
        if (refreshButton && !refreshButton.disabled) {
          refreshButton.click()
        }
      },
      keywords: ["refresh", "reload", "刷新", "重载"],
      shortcut: "Ctrl+R",
    },
  ]

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "k") {
        event.preventDefault()
        setIsOpen(true)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  return {
    isOpen,
    setIsOpen,
    commands,
  }
}
