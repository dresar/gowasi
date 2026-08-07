/**
 * AuroraBg — ReactBits-style animated aurora gradient background.
 * Renders a full-div aurora that can wrap hero sections or page backgrounds.
 */
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AuroraBgProps {
  children?: ReactNode
  className?: string
  colorA?: string
  colorB?: string
  colorC?: string
}

export function AuroraBg({
  children,
  className,
  colorA = '#6366f1',
  colorB = '#8b5cf6',
  colorC = '#06b6d4',
}: AuroraBgProps) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Aurora layers */}
      <div className="aurora-container pointer-events-none absolute inset-0">
        <div
          className="aurora-blob absolute -left-1/4 -top-1/4 h-3/4 w-3/4 rounded-full opacity-20 blur-3xl"
          style={{
            background: `radial-gradient(circle, ${colorA} 0%, transparent 70%)`,
            animation: 'aurora-drift-1 12s ease-in-out infinite alternate',
          }}
        />
        <div
          className="aurora-blob absolute -right-1/4 top-0 h-2/3 w-2/3 rounded-full opacity-15 blur-3xl"
          style={{
            background: `radial-gradient(circle, ${colorB} 0%, transparent 70%)`,
            animation: 'aurora-drift-2 16s ease-in-out infinite alternate',
          }}
        />
        <div
          className="aurora-blob absolute bottom-0 left-1/3 h-1/2 w-1/2 rounded-full opacity-20 blur-3xl"
          style={{
            background: `radial-gradient(circle, ${colorC} 0%, transparent 70%)`,
            animation: 'aurora-drift-3 10s ease-in-out infinite alternate',
          }}
        />
      </div>
      <div className="relative z-10">{children}</div>

      <style>{`
        @keyframes aurora-drift-1 {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(8%, 12%) scale(1.1); }
          100% { transform: translate(-5%, 8%) scale(0.95); }
        }
        @keyframes aurora-drift-2 {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-10%, -8%) scale(1.08); }
          100% { transform: translate(6%, -12%) scale(1.05); }
        }
        @keyframes aurora-drift-3 {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(5%, -10%) scale(1.12); }
          100% { transform: translate(-8%, 5%) scale(0.9); }
        }
      `}</style>
    </div>
  )
}
