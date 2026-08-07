/**
 * Ripple — Interactive ripple effect on click/tap (ReactBits style).
 * Wrap any element to add ripple feedback on interaction.
 */
import { type ReactNode, useRef, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'

interface RippleProps {
  children: ReactNode
  className?: string
  color?: string
  duration?: number
}

export function Ripple({
  children,
  className,
  color = 'rgba(255,255,255,0.3)',
  duration = 600,
}: RippleProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const size = Math.max(rect.width, rect.height) * 2

    const ripple = document.createElement('span')
    ripple.style.cssText = `
      position: absolute;
      left: ${x - size / 2}px;
      top: ${y - size / 2}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: 50%;
      transform: scale(0);
      animation: ripple-expand ${duration}ms ease-out forwards;
      pointer-events: none;
      z-index: 0;
    `
    container.appendChild(ripple)
    setTimeout(() => ripple.remove(), duration)
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden', className)}
      onClick={handleClick}
    >
      {children}
      <style>{`
        @keyframes ripple-expand {
          0%   { transform: scale(0); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
