"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, X, Home, Users, CreditCard, BarChart3, Settings, LogOut, Upload } from "lucide-react"
import { useMobileGestures } from "@/hooks/use-mobile-gestures"

interface MobileNavigationProps {
  currentTab: string
  onTabChange: (tab: string) => void
  onLogout: () => void
}

export function MobileNavigation({ currentTab, onTabChange, onLogout }: MobileNavigationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { isTouch, enableGestures } = useMobileGestures()

  const navigationItems = [
    { id: "overview", label: "概览", icon: Home },
    { id: "mothers", label: "母账号", icon: Users },
    { id: "codes-status", label: "码状态", icon: CreditCard },
    { id: "codes", label: "兑换码", icon: CreditCard },
    { id: "bulk-import", label: "批量导入", icon: Upload },
    { id: "users", label: "用户", icon: Users },
    { id: "audit", label: "审计", icon: BarChart3 },
    { id: "settings", label: "设置", icon: Settings },
  ]

  useEffect(() => {
    const handleSwipe = (e: CustomEvent) => {
      const { direction } = e.detail
      if (direction === "right" && !isOpen) {
        setIsOpen(true)
      } else if (direction === "left" && isOpen) {
        setIsOpen(false)
      }
    }

    if (isTouch) {
      window.addEventListener("swipe", handleSwipe as EventListener)
      return () => window.removeEventListener("swipe", handleSwipe as EventListener)
    }
  }, [isTouch, isOpen])

  const handleTabSelect = (tabId: string) => {
    onTabChange(tabId)
    setIsOpen(false)
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="md:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="p-2">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0 bg-card/95 backdrop-blur-md">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-6 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-primary to-brand-secondary rounded-lg flex items-center justify-center">
                      <span className="text-primary-foreground font-bold text-sm">⚙️</span>
                    </div>
                    <div>
                      <h2 className="font-semibold text-sm">管理后台</h2>
                      <p className="text-xs text-muted-foreground">GPT Team 邀请服务</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="p-1">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Navigation Items */}
              <div className="flex-1 py-4">
                <nav className="space-y-1 px-3">
                  {navigationItems.map((item) => {
                    const Icon = item.icon
                    const isActive = currentTab === item.id

                    return (
                      <Button
                        key={item.id}
                        variant={isActive ? "secondary" : "ghost"}
                        className={`w-full justify-start h-12 px-4 ${
                          isActive ? "bg-primary/10 text-primary border-primary/20" : "hover:bg-muted/50"
                        }`}
                        onClick={() => handleTabSelect(item.id)}
                      >
                        <Icon className="w-5 h-5 mr-3" />
                        <span className="font-medium">{item.label}</span>
                      </Button>
                    )
                  })}
                </nav>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-border/40">
                <Button
                  variant="ghost"
                  className="w-full justify-start h-12 px-4 text-red-600 hover:bg-red-500/10 hover:text-red-600"
                  onClick={onLogout}
                >
                  <LogOut className="w-5 h-5 mr-3" />
                  <span className="font-medium">退出登录</span>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Bottom Navigation for Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border/40">
        <div className="grid grid-cols-4 gap-1 p-2">
          {navigationItems.slice(0, 4).map((item) => {
            const Icon = item.icon
            const isActive = currentTab === item.id

            return (
              <Button
                key={item.id}
                variant="ghost"
                size="sm"
                className={`flex flex-col items-center justify-center h-16 px-2 ${
                  isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => handleTabSelect(item.id)}
              >
                <Icon className="w-5 h-5 mb-1" />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>
            )
          })}
        </div>
      </div>
    </>
  )
}
