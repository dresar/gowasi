/**
 * GlowCard — ReactBits-style card with spotlight hover glow effect.
 * Usage: <GlowCard glowColor="rgba(99,102,241,0.3)">content</GlowCard>
 */
import { useRef, type ReactNode, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'

interface GlowCardProps {
  children: ReactNode
  className?: string
  glowColor?: string
  borderColor?: string
}

export function GlowCard({
  children,
  className,
  glowColor = 'rgba(99,102,241,0.25)',
  borderColor = 'rgba(99,102,241,0.3)',
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    card.style.setProperty('--glow-x', `${x}px`)
    card.style.setProperty('--glow-y', `${y}px`)
    card.style.setProperty('--glow-opacity', '1')
  }

  function handleMouseLeave() {
    const card = cardRef.current
    if (!card) return
    card.style.setProperty('--glow-opacity', '0')
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative rounded-xl border bg-card text-card-foreground overflow-hidden transition-shadow duration-300',
        'hover:shadow-lg',
        className,
      )}
      style={{
        '--glow-x': '50%',
        '--glow-y': '50%',
        '--glow-opacity': '0',
        '--glow-color': glowColor,
        '--border-color': borderColor,
      } as React.CSSProperties}
    >
      {/* Spotlight overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300"
        style={{
          background: `radial-gradient(200px circle at var(--glow-x) var(--glow-y), var(--glow-color), transparent 70%)`,
          opacity: 'var(--glow-opacity)',
        }}
      />
      {/* Border glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300"
        style={{
          boxShadow: `inset 0 0 0 1px var(--border-color)`,
          opacity: 'var(--glow-opacity)',
        }}
      />
      <div className="relative z-10 h-full w-full flex flex-col min-h-0">{children}</div>
    </div>
  )
}
