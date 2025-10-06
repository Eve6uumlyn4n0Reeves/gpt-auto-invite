"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus, X } from "lucide-react"

interface FABAction {
  id: string
  label: string
  icon: React.ReactNode
  action: () => void
  color?: string
}

interface MobileFABProps {
  actions: FABAction[]
  primaryAction?: FABAction
}

export function MobileFAB({ actions, primaryAction }: MobileFABProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY

      // Hide FAB when scrolling down, show when scrolling up
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false)
        setIsExpanded(false)
      } else if (currentScrollY < lastScrollY) {
        setIsVisible(true)
      }

      setLastScrollY(currentScrollY)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [lastScrollY])

  const handlePrimaryAction = () => {
    if (primaryAction) {
      primaryAction.action()
    } else if (actions.length > 0) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div
      className={`md:hidden fixed bottom-20 right-4 z-40 transition-all duration-300 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0"
      }`}
    >
      {/* Action Buttons */}
      {isExpanded && (
        <div className="mb-4 space-y-3">
          {actions.map((action, index) => (
            <div
              key={action.id}
              className={`flex items-center justify-end transition-all duration-300 delay-${index * 50}`}
              style={{
                transform: isExpanded ? "translateY(0)" : "translateY(20px)",
                opacity: isExpanded ? 1 : 0,
              }}
            >
              <span className="mr-3 px-3 py-1 bg-card/90 backdrop-blur-sm rounded-full text-sm font-medium shadow-lg border border-border/40">
                {action.label}
              </span>
              <Button
                size="sm"
                className={`w-12 h-12 rounded-full shadow-lg ${action.color || "bg-primary hover:bg-primary/90"}`}
                onClick={() => {
                  action.action()
                  setIsExpanded(false)
                }}
              >
                {action.icon}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Main FAB */}
      <Button
        size="lg"
        className={`w-14 h-14 rounded-full shadow-lg transition-all duration-300 ${
          isExpanded ? "bg-red-500 hover:bg-red-600 rotate-45" : "bg-primary hover:bg-primary/90"
        }`}
        onClick={handlePrimaryAction}
      >
        {isExpanded ? <X className="w-6 h-6" /> : primaryAction ? primaryAction.icon : <Plus className="w-6 h-6" />}
      </Button>
    </div>
  )
}
