/**
 * GradientText — Animated gradient text component from ReactBits style.
 * Applies an animated gradient sweep to text content.
 */
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GradientTextProps {
  children: ReactNode
  className?: string
  from?: string
  via?: string
  to?: string
  animated?: boolean
}

export function GradientText({
  children,
  className,
  from = '#6366f1',
  via = '#8b5cf6',
  to = '#06b6d4',
  animated = true,
}: GradientTextProps) {
  return (
    <span
      className={cn('inline-block bg-clip-text text-transparent', className)}
      style={{
        backgroundImage: `linear-gradient(135deg, ${from}, ${via}, ${to}, ${from})`,
        backgroundSize: animated ? '300% 100%' : '100% 100%',
        animation: animated ? 'gradient-text-scroll 5s linear infinite' : undefined,
      }}
    >
      {children}
      {animated && (
        <style>{`
          @keyframes gradient-text-scroll {
            0%   { background-position: 0% 50%; }
            100% { background-position: 300% 50%; }
          }
        `}</style>
      )}
    </span>
  )
}
