/**
 * PixelCard — ReactBits-style card with pixelated grid hover reveal effect.
 */
import { useRef, type ReactNode, type MouseEvent, useState } from 'react'
import { cn } from '@/lib/utils'

interface PixelCardProps {
  children: ReactNode
  className?: string
  pixelColor?: string
  gridSize?: number
}

export function PixelCard({
  children,
  className,
  pixelColor = 'rgba(99,102,241,0.15)',
  gridSize = 20,
}: PixelCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    setCoords({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMouseMove}
      className={cn(
        'relative rounded-xl border bg-card text-card-foreground overflow-hidden transition-all duration-300',
        'hover:border-primary/50 hover:shadow-xl',
        className,
      )}
    >
      {/* Pixel Grid Overlay */}
      {hovered && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300 z-0"
          style={{
            backgroundImage: `radial-gradient(circle at ${coords.x}px ${coords.y}px, ${pixelColor} 0%, transparent 60%)`,
            backgroundSize: `${gridSize}px ${gridSize}px`,
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
