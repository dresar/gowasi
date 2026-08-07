/**
 * SplitText — ReactBits-style text animation where each character animates independently.
 * Useful for hero headings and section titles.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SplitTextProps {
  children: string
  className?: string
  charClassName?: string
  staggerMs?: number
  animationDelay?: number
}

export function SplitText({
  children,
  className,
  charClassName,
  staggerMs = 30,
  animationDelay = 0,
}: SplitTextProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), animationDelay)
    return () => clearTimeout(t)
  }, [animationDelay])

  const chars = children.split('')

  return (
    <span className={cn('inline', className)} aria-label={children}>
      {chars.map((char, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn('inline-block transition-all', charClassName)}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(100%)',
            transitionDelay: `${animationDelay + i * staggerMs}ms`,
            transitionDuration: '400ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            whiteSpace: char === ' ' ? 'pre' : 'normal',
          }}
        >
          {char}
        </span>
      ))}
    </span>
  )
}

/**
 * FadeUp — Simple fade + translate up entrance animation.
 */
interface FadeUpProps {
  children: ReactNode
  className?: string
  delay?: number
  duration?: number
}

export function FadeUp({ children, className, delay = 0, duration = 500 }: FadeUpProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <div
      className={cn('transition-all', className)}
      style={{
        transitionDuration: `${duration}ms`,
        transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
      }}
    >
      {children}
    </div>
  )
}
