import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '@/components/error-boundary'

function Boom() {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('renders fallback when child throws', () => {
    render(
      <ErrorBoundary>
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore intentionally throwing */}
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByText('页面出错了')).toBeInTheDocument()
  })
})

