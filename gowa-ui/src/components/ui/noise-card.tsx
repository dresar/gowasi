/**
 * NoiseCard — ReactBits-style textured card with subtle noise overlay.
 */
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface NoiseCardProps {
  children: ReactNode
  className?: string
  noiseOpacity?: number
}

export function NoiseCard({
  children,
  className,
  noiseOpacity = 0.04,
}: NoiseCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl border bg-card text-card-foreground overflow-hidden shadow-sm transition-all duration-300',
        'hover:shadow-md',
        className,
      )}
    >
      {/* SVG Noise filter */}
      <div
        className="pointer-events-none absolute inset-0 z-0 mix-blend-overlay"
        style={{
          opacity: noiseOpacity,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
