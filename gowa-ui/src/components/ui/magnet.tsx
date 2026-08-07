/**
 * Magnet — ReactBits magnetic hover effect.
 * Element "attracts" cursor, creating a magnetic pull sensation.
 */
import { useRef, type ReactNode, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'

interface MagnetProps {
  children: ReactNode
  className?: string
  strength?: number // 0.3 = subtle, 1 = strong
  disabled?: boolean
}

export function Magnet({
  children,
  className,
  strength = 0.4,
  disabled = false,
}: MagnetProps) {
  const ref = useRef<HTMLDivElement>(null)

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (disabled) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = (e.clientX - cx) * strength
    const dy = (e.clientY - cy) * strength
    el.style.transform = `translate(${dx}px, ${dy}px)`
    el.style.transition = 'transform 0.1s linear'
  }

  function handleMouseLeave() {
    if (disabled) return
    const el = ref.current
    if (!el) return
    el.style.transform = 'translate(0, 0)'
    el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
  }

  return (
    <div
      ref={ref}
      className={cn('inline-block', className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  )
}
