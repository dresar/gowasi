/**
 * AnimatedList — ReactBits stagger-animated list of items.
 * Each item animates in with a slide-up + fade effect when mounted.
 */
import { type ReactNode, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface AnimatedListProps {
  children: ReactNode[]
  className?: string
  itemClassName?: string
  staggerMs?: number
  duration?: number
}

export function AnimatedList({
  children,
  className,
  itemClassName,
  staggerMs = 60,
  duration = 350,
}: AnimatedListProps) {
  const [visible, setVisible] = useState<boolean[]>([])

  useEffect(() => {
    setVisible(new Array(children.length).fill(false))
    children.forEach((_, i) => {
      setTimeout(() => {
        setVisible((prev) => {
          const next = [...prev]
          next[i] = true
          return next
        })
      }, i * staggerMs)
    })
  }, [children.length, staggerMs])

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {children.map((child, i) => (
        <div
          key={i}
          className={cn('transition-all', itemClassName)}
          style={{
            transitionDuration: `${duration}ms`,
            transitionProperty: 'opacity, transform',
            opacity: visible[i] ? 1 : 0,
            transform: visible[i] ? 'translateY(0)' : 'translateY(16px)',
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

// ─── Single animated item (standalone use) ────────────────────────────────────
interface AnimatedItemProps {
  children: ReactNode
  className?: string
  delay?: number
}

export function AnimatedItem({ children, className, delay = 0 }: AnimatedItemProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <div
      className={cn('transition-all duration-500', className)}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
      }}
    >
      {children}
    </div>
  )
}
