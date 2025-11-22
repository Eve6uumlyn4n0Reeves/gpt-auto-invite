"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback, useEffect } from "react"
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

type NotificationType = "success" | "error" | "warning" | "info" | "loading"

interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number
  persistent?: boolean
  action?: {
    label: string
    onClick: () => void
  }
  progress?: number
}

interface NotificationContextType {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, "id">) => string
  removeNotification: (id: string) => void
  updateNotification: (id: string, updates: Partial<Notification>) => void
  clearAll: () => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider")
  }
  return context
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const addNotification = useCallback((notification: Omit<Notification, "id">) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newNotification = { ...notification, id }

    setNotifications((prev) => [...prev, newNotification])

    // Auto-remove non-persistent notifications
    if (!notification.persistent && notification.type !== "loading") {
      const duration = notification.duration ?? (notification.type === "error" ? 7000 : 5000)
      setTimeout(() => {
        removeNotification(id)
      }, duration)
    }

    return id
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id))
  }, [])

  const updateNotification = useCallback((id: string, updates: Partial<Notification>) => {
    setNotifications((prev) =>
      prev.map((notification) => (notification.id === id ? { ...notification, ...updates } : notification)),
    )
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        updateNotification,
        clearAll,
      }}
    >
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  )
}

function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications()

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  )
}

function NotificationItem({
  notification,
  onRemove,
}: {
  notification: Notification
  onRemove: () => void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const handleRemove = () => {
    setIsRemoving(true)
    setTimeout(onRemove, 300) // Wait for animation
  }

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
    loading: Zap,
  }

  const Icon = icons[notification.type]

  const typeStyles = {
    success: "border-green-500/50 bg-green-500/10 text-green-600",
    error: "border-red-500/50 bg-red-500/10 text-red-600",
    warning: "border-yellow-500/50 bg-yellow-500/10 text-yellow-600",
    info: "border-blue-500/50 bg-blue-500/10 text-blue-600",
    loading: "border-primary/50 bg-primary/10 text-primary",
  }

  return (
    <div
      className={cn(
        "relative flex items-start space-x-3 p-4 rounded-lg border backdrop-blur-sm transition-all duration-300",
        typeStyles[notification.type],
        isVisible && !isRemoving ? "animate-in slide-in-from-right-full" : "animate-out slide-out-to-right-full",
        isRemoving && "opacity-0 scale-95",
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Icon className={cn("w-5 h-5", notification.type === "loading" && "animate-spin")} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{notification.title}</p>
        {notification.message && <p className="text-sm opacity-90 mt-1">{notification.message}</p>}

        {notification.progress !== undefined && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span>进度</span>
              <span>{notification.progress}%</span>
            </div>
            <div className="w-full bg-black/20 rounded-full h-1">
              <div
                className="bg-current h-1 rounded-full transition-all duration-300"
                style={{ width: `${notification.progress}%` }}
              />
            </div>
          </div>
        )}

        {notification.action && (
          <button
            onClick={notification.action.onClick}
            className="text-sm font-medium underline mt-2 hover:no-underline transition-all"
          >
            {notification.action.label}
          </button>
        )}
      </div>

      {!notification.persistent && (
        <button onClick={handleRemove} className="flex-shrink-0 p-1 hover:bg-black/10 rounded transition-colors">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
