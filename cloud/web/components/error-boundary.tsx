'use client'

import React from 'react'

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('Admin ErrorBoundary caught:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="mx-auto max-w-3xl p-6">
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
              <h2 className="mb-2 text-lg font-semibold text-red-600">页面出错了</h2>
              <p className="text-sm text-red-600/80">请刷新页面或稍后重试。</p>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}

